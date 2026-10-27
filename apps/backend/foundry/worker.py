import json
import logging
import os
import smtplib
import socket
import threading
from datetime import timedelta
from email.message import EmailMessage
from html import escape
from uuid import uuid4

import redis
from celery import Celery, signals
from sqlalchemy import select, update

from .config import get_settings
from .db import after_commit, transaction
from .models import MediaJob, now

log = logging.getLogger(__name__)
config = get_settings()
app = Celery("sticker_foundry", broker=config.redis_url)
app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    broker_transport_options={
        "global_keyprefix": config.queue_prefix + ":celery:",
        "visibility_timeout": 600,
    },
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_time_limit=max(300, config.background_removal_timeout_ms // 1000 + 180),
    broker_connection_retry_on_startup=True,
    task_ignore_result=True,
    task_always_eager=config.testing,
    task_eager_propagates=False,
)


def report_progress(job_id, token, percent):
    with transaction() as db:
        db.execute(
            update(MediaJob)
            .where(MediaJob.id == job_id, MediaJob.run_token == token, MediaJob.status == "PROCESSING")
            .values(progress=percent)
        )
        db.commit()


def send_email(payload):
    settings = get_settings()
    if not settings.smtp_host:
        raise RuntimeError("Password reset email is not configured")
    message = EmailMessage()
    message["From"] = settings.smtp_from or settings.smtp_user or "Sticker Foundry <noreply@localhost>"
    message["To"] = payload["email"]
    message["Subject"] = f"Reset your {settings.instance_name} password"
    message.set_content(
        f"Hello {payload['displayName']},\n\nReset your password: {payload['resetUrl']}\n\nThis link expires at {payload['expiresAt']}."
    )
    message.add_alternative(
        f'<p>Hello {escape(payload["displayName"])},</p><p><a href="{escape(payload["resetUrl"], quote=True)}">Reset your password</a></p><p>This link expires at {escape(payload["expiresAt"])}.</p>',
        subtype="html",
    )
    factory = smtplib.SMTP_SSL if settings.smtp_secure else smtplib.SMTP
    with factory(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
        if not settings.smtp_secure:
            smtp.ehlo()
            if smtp.has_extn("starttls"):
                smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)


@app.task(bind=True, name="foundry.process", max_retries=None)
def process_job(self, job_id):
    token = str(uuid4())
    with transaction() as db:
        job = db.scalar(select(MediaJob).where(MediaJob.id == job_id).with_for_update())
        if job is None or job.status != "QUEUED":
            return
        job.status, job.progress, job.started_at = "PROCESSING", 5, now()
        job.attempts += 1
        job.run_token, job.error = token, None
        job.lease_expires = now() + timedelta(seconds=app.conf.task_time_limit + 60)
        db.commit()
        kind, user_id, pack_id, payload = job.type, job.user_id, job.pack_id, job.payload or {}
    try:
        result = None
        with transaction() as db:
            if kind == "media":
                from .media import apply_upload
                from .schemas import MediaOptions
                from .storage import get_storage

                storage = get_storage()
                raw = storage.read(payload["inputKey"])
                report_progress(job_id, token, 30)
                result = apply_upload(
                    db, user_id, pack_id, raw, MediaOptions.model_validate(payload["options"])
                )
                after_commit(db, lambda: storage.delete(payload["inputKey"]))
            elif kind == "export":
                from .access import Access
                from .exports import build_zip

                pack = Access(db, user_id).get(pack_id)
                _, checksum = build_zip(db, pack)
                result = {"contentHash": checksum, "exportPath": f"/packs/{pack_id}/export"}
            elif kind == "email":
                send_email(payload)
                result = {"sent": True}
            else:
                raise ValueError(f"Unknown job type: {kind}")
            job = db.scalar(
                select(MediaJob)
                .where(MediaJob.id == job_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
            if job is None or job.status != "PROCESSING" or job.run_token != token:
                db.rollback()
                return
            job.status, job.progress, job.completed_at = "COMPLETED", 100, now()
            job.result, job.lease_expires = result, None
            db.commit()
    except Exception as error:
        # Never overwrite a cancellation, a new retry, or a recovered lease.
        with transaction() as db:
            job = db.scalar(select(MediaJob).where(MediaJob.id == job_id).with_for_update())
            if job is None or job.status != "PROCESSING" or job.run_token != token:
                return
            failed = job.attempts >= get_settings().queue_attempts
            job.error = str(getattr(error, "detail", error))[:2000]
            job.status = "FAILED" if failed else "QUEUED"
            job.completed_at = now() if failed else None
            job.lease_expires = None
            kind, attempts = job.type, job.attempts
            db.commit()
        log.warning("%s job %s failed: %s", kind, job_id, type(error).__name__)
        if not failed:
            raise self.retry(
                countdown=get_settings().queue_backoff_ms / 1000 * 2 ** (attempts - 1), queue=kind
            ) from error


heartbeat_stop = threading.Event()


@signals.worker_process_init.connect
def worker_process_init(**_):
    # A forked Celery child must never reuse its parent's DB connections.
    from .db import get_engine

    get_engine().dispose(close=False)


def recover_jobs():
    # PostgreSQL records are durable across broker or worker restarts.
    with transaction() as db:
        rows = list(
            db.scalars(
                select(MediaJob)
                .where(
                    ((MediaJob.status == "PROCESSING") & (MediaJob.lease_expires < now()))
                    | (
                        (MediaJob.status == "QUEUED")
                        & (
                            (MediaJob.dispatched_at.is_(None))
                            | (MediaJob.dispatched_at < now() - timedelta(seconds=600))
                        )
                    )
                )
                .with_for_update(skip_locked=True)
            )
        )
        pending = []
        for job in rows:
            if job.status == "PROCESSING":
                job.status, job.run_token, job.lease_expires = "QUEUED", None, None
                job.error = "Worker interrupted; processing will resume"
            job.dispatched_at = now()
            pending.append((job.id, job.type))
        db.commit()
    for job_id, kind in pending:
        process_job.apply_async(args=[job_id], queue=kind)


@signals.worker_ready.connect
def worker_ready(sender=None, **_):
    queues = list(sender.app.amqp.queues.consume_from)
    worker_id = f"{socket.gethostname()}-{os.getpid()}"

    def heartbeat():
        connection = redis.Redis.from_url(get_settings().redis_url, socket_timeout=3)
        key = f"{get_settings().queue_prefix}:workers:{worker_id}"
        while not heartbeat_stop.is_set():
            try:
                connection.setex(key, 40, json.dumps({"queues": queues, "pid": os.getpid()}))
                if "media" in queues:
                    recover_jobs()
            except Exception:
                log.exception("Worker heartbeat/recovery failed")
            heartbeat_stop.wait(10)
        try:
            connection.delete(key)
        except redis.RedisError:
            pass
        connection.close()

    threading.Thread(target=heartbeat, name="worker-heartbeat", daemon=True).start()


@signals.worker_shutdown.connect
def worker_shutdown(**_):
    heartbeat_stop.set()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--queue", choices=["media", "export", "email"], default="media")
    parser.add_argument("--concurrency", type=int, default=1)
    args = parser.parse_args()
    command = [
        "worker",
        "--loglevel=INFO",
        f"--queues={args.queue}",
        f"--concurrency={args.concurrency}",
        f"--hostname={args.queue}@%h",
    ]
    if os.name == "nt":
        command.append("--pool=solo")
    app.worker_main(command)
