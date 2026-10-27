import asyncio
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import current_user
from .common import data, fail
from .config import get_settings
from .db import get_db, session_factory
from .models import MediaJob, User, now

router = APIRouter(prefix="/jobs", tags=["Background jobs"])


def job_data(job):
    return data(job, exclude=("payload", "runToken", "leaseExpires", "dispatchedAt"))


def owned_job(db, user_id, job_id, *, lock=False):
    query = select(MediaJob).where(MediaJob.id == job_id, MediaJob.user_id == user_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    job = db.scalar(query)
    if job is None:
        fail(404, "Job not found")
    return job


def assert_queue_capacity(db):
    settings = get_settings()
    waiting = db.scalar(
        select(func.count())
        .select_from(MediaJob)
        .where(MediaJob.type == "media", MediaJob.status == "QUEUED")
    )
    if waiting >= settings.media_queue_max_waiting:
        from fastapi import HTTPException

        raise HTTPException(
            503,
            "The media queue is full. Retry shortly.",
            headers={"Retry-After": str(settings.media_queue_retry_after_seconds)},
        )


def dispatch(job_id, kind):
    from .worker import process_job

    if get_settings().testing:
        process_job.apply(args=[job_id], throw=False)
    else:
        process_job.apply_async(args=[job_id], queue=kind)


def enqueue(db, user_id, kind, payload, *, pack_id=None):
    job = MediaJob(user_id=user_id, type=kind, pack_id=pack_id, payload=payload)
    db.add(job)
    # The worker must never receive a job whose database transaction is not committed.
    db.commit()
    try:
        dispatch(job.id, kind)
        job.dispatched_at = now()
        db.commit()
    except Exception:
        job.status, job.error, job.completed_at = "FAILED", "The processing queue is unavailable", now()
        db.commit()
        fail(503, "The processing queue is unavailable. Retry the job shortly.")
    db.refresh(job)
    return job_data(job)


@router.get("/{job_id}")
def get_job(job_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return job_data(owned_job(db, user.id, job_id))


@router.post("/{job_id}/cancel", status_code=201)
def cancel(job_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    job = owned_job(db, user.id, job_id, lock=True)
    if job.status not in {"QUEUED", "PROCESSING"}:
        fail(400, "Job cannot be cancelled in its current state")
    job.status, job.completed_at = "CANCELLED", now()
    db.flush()
    return job_data(job)


@router.post("/{job_id}/retry", status_code=201)
def retry(job_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    job = owned_job(db, user.id, job_id, lock=True)
    if job.status not in {"FAILED", "CANCELLED"}:
        fail(400, "Only failed or cancelled jobs can be retried")
    job.status, job.progress, job.error, job.result = "QUEUED", 0, None, None
    job.run_token, job.lease_expires, job.started_at, job.completed_at = None, None, None, None
    job.dispatched_at = None
    job.attempts = 0
    db.commit()
    try:
        dispatch(job.id, job.type)
        job.dispatched_at = now()
        db.commit()
    except Exception:
        job.status, job.error, job.completed_at = "FAILED", "The processing queue is unavailable", now()
        db.commit()
        fail(503, "The processing queue is unavailable")
    db.refresh(job)
    return job_data(job)


def read_event(user_id, job_id):
    with session_factory()() as db:
        return job_data(owned_job(db, user_id, job_id))


@router.get("/{job_id}/events")
def events(job_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned_job(db, user.id, job_id)

    async def stream():
        previous = None
        while not await request.is_disconnected():
            value = await asyncio.to_thread(read_event, user.id, job_id)
            encoded = json.dumps(value, ensure_ascii=False)
            if encoded != previous:
                yield f"data: {encoded}\n\n"
                previous = encoded
            if value["status"] in {"COMPLETED", "FAILED", "CANCELLED"}:
                break
            await asyncio.sleep(1)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
