import json
import os
import platform
import time
from functools import lru_cache

import psutil
import redis
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from .common import iso
from .config import get_settings
from .db import get_db
from .models import MediaJob, now

router = APIRouter(tags=["Health"])
started = time.monotonic()
QUEUES = ("media", "export", "email")


@lru_cache
def get_redis():
    return redis.Redis.from_url(
        get_settings().redis_url, socket_timeout=3, socket_connect_timeout=3, decode_responses=True
    )


def queue_status(db):
    settings = get_settings()
    workers = dict.fromkeys(QUEUES, 0)
    if settings.testing:
        workers = dict.fromkeys(QUEUES, 1)
    else:
        client = get_redis()
        client.ping()
        for key in client.scan_iter(match=settings.queue_prefix + ":workers:*"):
            content = client.get(key)
            if not content:
                continue
            for queue in json.loads(content).get("queues", []):
                if queue in workers:
                    workers[queue] += 1
    counts = {
        (kind, status): count
        for kind, status, count in db.execute(
            select(MediaJob.type, MediaJob.status, func.count()).group_by(MediaJob.type, MediaJob.status)
        )
    }
    return [
        {
            "name": queue,
            "workers": workers[queue],
            "waiting": counts.get((queue, "QUEUED"), 0),
            "active": counts.get((queue, "PROCESSING"), 0),
            "failed": counts.get((queue, "FAILED"), 0),
            "delayed": 0,
        }
        for queue in QUEUES
    ]


@router.get("/health")
def live(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        database = "ok"
    except Exception:
        db.rollback()
        database = "unavailable"
    return JSONResponse(
        {
            "status": "ok" if database == "ok" else "unavailable",
            "timestamp": iso(now()),
            "uptimeSeconds": int(time.monotonic() - started),
            "checks": {"database": database},
        },
        status_code=200 if database == "ok" else 503,
    )


@router.get("/health/ready")
def ready(db: Session = Depends(get_db)):
    database, queue, queues = "ok", "ok", []
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db.rollback()
        database = "unavailable"
    try:
        queues = queue_status(db)
        if not all(item["workers"] > 0 for item in queues):
            queue = "unavailable"
    except Exception:
        db.rollback()
        queue = "unavailable"
    ok = database == queue == "ok"
    return JSONResponse(
        {
            "status": "ok" if ok else "unavailable",
            "timestamp": iso(now()),
            "uptimeSeconds": int(time.monotonic() - started),
            "checks": {"database": database, "queue": queue},
            "queues": queues,
        },
        status_code=200 if ok else 503,
    )


@router.get("/health/metrics")
def metrics(db: Session = Depends(get_db)):
    queues = []
    try:
        queues = queue_status(db)
    except Exception:
        db.rollback()
    return {
        "uptimeSeconds": int(time.monotonic() - started),
        "memory": {"rssBytes": psutil.Process().memory_info().rss},
        "process": {"pid": os.getpid(), "pythonVersion": platform.python_version()},
        "queue": {
            "configured": True,
            "names": list(QUEUES),
            "workerExpected": True,
            "workerAvailable": bool(queues) and all(q["workers"] > 0 for q in queues),
            "workers": [{"name": q["name"], "workers": q["workers"]} for q in queues],
        },
    }


@router.get("/metrics", response_class=PlainTextResponse)
def prometheus(db: Session = Depends(get_db)):
    values = metrics(db)
    lines = [
        "# TYPE stickerfoundry_uptime_seconds gauge",
        f"stickerfoundry_uptime_seconds {values['uptimeSeconds']}",
        "# TYPE stickerfoundry_memory_bytes gauge",
        f'stickerfoundry_memory_bytes{{type="rss"}} {values["memory"]["rssBytes"]}',
        "# TYPE stickerfoundry_process_info gauge",
        f'stickerfoundry_process_info{{pid="{os.getpid()}",python_version="{platform.python_version()}"}} 1',
        "# TYPE stickerfoundry_worker_available gauge",
        f"stickerfoundry_worker_available {int(values['queue']['workerAvailable'])}",
        "# TYPE stickerfoundry_queue_workers gauge",
    ]
    lines += [
        f'stickerfoundry_queue_workers{{queue="{q["name"]}"}} {q["workers"]}'
        for q in values["queue"]["workers"]
    ]
    return PlainTextResponse("\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")
