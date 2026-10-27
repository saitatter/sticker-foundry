import csv
import io
import json
from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .auth import admin_user
from .collaboration import audit_data
from .common import audit, iso, positive, setting
from .config import get_settings
from .db import db_dependency
from .models import AppSetting, AuditLog, User, now
from .schemas import UpdateSettings

router = APIRouter(prefix="/admin", tags=["Administration"])
public_router = APIRouter(tags=["Instance"])


def instance_settings(db):
    config = get_settings()
    return {
        "instanceName": setting(db, "instanceName", config.instance_name),
        "instanceDescription": setting(db, "instanceDescription", config.instance_description),
    }


def all_settings(db):
    config = get_settings()
    return {
        **instance_settings(db),
        "registrationMode": setting(db, "registrationMode", config.registration_mode),
        "registrationInviteCode": setting(db, "registrationInviteCode", config.registration_invite_code),
        "storageQuotaBytes": positive(setting(db, "storageQuotaBytes", config.storage_quota_bytes)),
        "auditRetentionDays": positive(setting(db, "auditRetentionDays", config.audit_retention_days)),
        "backgroundRemoval": {
            "thresholdAvailable": True,
            "aiCommandConfigured": bool(config.background_removal_command),
            "aiMode": "command" if config.background_removal_command else None,
            "fallbackMode": "threshold",
        },
    }


@public_router.get("/instance")
def instance(db: Session = db_dependency):
    return instance_settings(db)


@router.get("/settings")
def settings(user: User = Depends(admin_user), db: Session = db_dependency):
    return all_settings(db)


@router.patch("/settings")
def update_settings(payload: UpdateSettings, user: User = Depends(admin_user), db: Session = db_dependency):
    values = payload.model_dump(exclude_unset=True)
    for key, value in values.items():
        if value is None and key in {"instanceName", "instanceDescription", "registrationMode"}:
            continue
        row = db.get(AppSetting, key)
        if row is None:
            row = AppSetting(key=key, value="")
            db.add(row)
        row.value = "" if value is None else str(value)
    audit(db, user.id, "admin.settings.update", "appSetting", metadata={"changedFields": list(values)})
    db.flush()
    return all_settings(db)


@router.get("/audit-log")
def audit_log(
    limit: int = Query(default=100, ge=1, le=1000),
    user: User = Depends(admin_user),
    db: Session = db_dependency,
):
    return [
        audit_data(db, row)
        for row in db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit))
    ]


def csv_cell(value):
    text = "" if value is None else str(value)
    if text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")):
        text = "'" + text
    return text


@router.get("/audit-log/export")
def export_audit(
    limit: int = Query(default=1000, ge=1, le=1000),
    user: User = Depends(admin_user),
    db: Session = db_dependency,
):
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(
        [
            "id",
            "createdAt",
            "actorId",
            "action",
            "entityType",
            "entityId",
            "requestId",
            "ipAddress",
            "userAgent",
            "metadata",
        ]
    )
    for row in db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)):
        writer.writerow(
            [
                csv_cell(value)
                for value in [
                    row.id,
                    iso(row.created_at),
                    row.actor_id,
                    row.action,
                    row.entity_type,
                    row.entity_id,
                    row.request_id,
                    row.ip_address,
                    row.user_agent,
                    json.dumps(row.details, ensure_ascii=False),
                ]
            ]
        )
    return Response(
        output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="audit-log.csv"'},
    )


@router.post("/audit-log/cleanup", status_code=201)
def cleanup(user: User = Depends(admin_user), db: Session = db_dependency):
    days = positive(setting(db, "auditRetentionDays", get_settings().audit_retention_days))
    cutoff = now() - timedelta(days=days) if days else None
    removed = db.execute(delete(AuditLog).where(AuditLog.created_at < cutoff)).rowcount if cutoff else 0
    result = {"retentionDays": days, "deleted": removed, "cutoff": iso(cutoff) if cutoff else None}
    audit(db, user.id, "admin.audit.cleanup", "auditLog", metadata=result)
    return result
