import re
from contextvars import ContextVar
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import inspect

from .models import AppSetting, AuditLog

request_context: ContextVar[dict | None] = ContextVar("request_context", default=None)


def fail(status: int, message: str):
    raise HTTPException(status_code=status, detail=message)


def iso(value: datetime) -> str:
    return value.isoformat(timespec="milliseconds") + "Z"


def serial(value):
    if isinstance(value, datetime):
        return iso(value)
    if isinstance(value, dict):
        return {key: serial(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [serial(item) for item in value]
    return value


def camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(word.title() for word in rest)


def snake(value: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", value).lower()


def data(row, *, exclude=()):
    return {
        camel(prop.columns[0].name): serial(getattr(row, prop.key))
        for prop in inspect(row).mapper.column_attrs
        if camel(prop.columns[0].name) not in exclude
    }


def public_user(user):
    return {camel(key): getattr(user, key) for key in ("id", "email", "display_name", "is_admin")}


def setting(db, key: str, fallback="") -> str:
    value = db.get(AppSetting, key)
    return value.value if value else fallback


def positive(value) -> int | None:
    try:
        parsed = int(value)
        return parsed if parsed > 0 else None
    except (TypeError, ValueError):
        return None


def audit(db, actor, action, entity_type, entity_id=None, metadata=None):
    context = request_context.get() or {}
    db.add(
        AuditLog(
            actor_id=actor,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=serial(metadata),
            request_id=context.get("requestId"),
            ip_address=context.get("ipAddress"),
            user_agent=context.get("userAgent"),
        )
    )
