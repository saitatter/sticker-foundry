import hashlib
import re
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error
from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .common import audit, data, fail, public_user, setting
from .config import get_settings
from .db import db_dependency
from .models import PasswordResetToken, User, UserSession, now
from .schemas import ChangePassword, Login, Refresh, Register, RequestReset, ResetPassword

router = APIRouter(prefix="/auth", tags=["Accounts"])


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


password_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)


def hash_password(value: str) -> str:
    return password_hasher.hash(value)


def check_password(value: str, hashed: str) -> bool:
    try:
        return password_hasher.verify(hashed, value)
    except Argon2Error:
        return False


def current_user(request: Request, db: Session = db_dependency) -> User:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        fail(401, "Unauthorized")
    try:
        payload = jwt.decode(
            auth[7:],
            get_settings().jwt_secret,
            algorithms=["HS256"],
            options={"require": ["sub", "sid", "exp"]},
        )
    except jwt.PyJWTError:
        fail(401, "Unauthorized")
    session = db.get(UserSession, payload["sid"])
    if (
        session is None
        or session.user_id != payload["sub"]
        or session.revoked_at is not None
        or session.expires_at <= now()
    ):
        fail(401, "Unauthorized")
    request.state.session_id = session.id
    user = db.get(User, payload["sub"])
    if user is None:
        fail(401, "Unauthorized")
    return user


def admin_user(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        fail(403, "Admin access is required")
    return user


def token_ttl(value: str) -> int:
    match = re.fullmatch("(\\d+)(s|m|h|d)?", value.strip())
    if not match:
        raise ValueError("ACCESS_TOKEN_TTL must be a duration such as 15m")
    return int(match[1]) * {None: 1, "s": 1, "m": 60, "h": 3600, "d": 86400}[match[2]]


def auth_response(db: Session, user: User, request: Request, response: Response, session=None):
    settings = get_settings()
    refresh_token = secrets.token_urlsafe(48)
    expiry = now() + timedelta(days=settings.refresh_token_ttl_days)
    if session is None:
        session = UserSession(user_id=user.id, refresh_token_hash=digest(refresh_token), expires_at=expiry)
        db.add(session)
    else:
        session.refresh_token_hash = digest(refresh_token)
        session.expires_at = expiry
        session.revoked_at = None
    db.flush()
    timestamp = datetime.now(UTC)
    access = jwt.encode(
        {
            "sub": user.id,
            "sid": session.id,
            "email": user.email,
            "iat": timestamp,
            "exp": timestamp + timedelta(seconds=token_ttl(settings.access_token_ttl)),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
    result = {"accessToken": access, "refreshToken": refresh_token, "user": public_user(user)}
    if settings.auth_refresh_cookie_enabled:
        response.set_cookie(
            settings.auth_refresh_cookie_name,
            refresh_token,
            max_age=settings.refresh_token_ttl_days * 86400,
            httponly=True,
            secure=settings.auth_refresh_cookie_secure,
            samesite=settings.auth_refresh_cookie_same_site,
            path=settings.auth_refresh_cookie_path,
        )
        if request.headers.get("x-refresh-cookie", "").lower() == "true":
            result.pop("refreshToken")
    return result


@router.post("/register", status_code=201)
def register(payload: Register, request: Request, response: Response, db: Session = db_dependency):
    settings = get_settings()
    mode = setting(db, "registrationMode", settings.registration_mode).lower()
    if mode == "disabled":
        fail(403, "Registration is disabled on this instance")
    expected = setting(db, "registrationInviteCode", settings.registration_invite_code)
    if mode == "invite-only" and (
        not expected or not secrets.compare_digest(payload.inviteCode or "", expected)
    ):
        fail(403, "A valid invite code is required")
    password = hash_password(payload.password)
    if db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(736654102350)"))
    if db.scalar(select(User.id).where(User.email == payload.email.lower())):
        fail(409, "Email is already registered")
    first = db.scalar(select(func.count()).select_from(User)) == 0
    user = User(
        email=payload.email.lower(), display_name=payload.displayName, password_hash=password, is_admin=first
    )
    try:
        db.add(user)
        db.flush()
    except IntegrityError:
        db.rollback()
        fail(409, "Email is already registered")
    result = auth_response(db, user, request, response)
    audit(db, user.id, "auth.register", "user", user.id)
    return result


@router.post("/login", status_code=201)
def login(payload: Login, request: Request, response: Response, db: Session = db_dependency):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not check_password(payload.password, user.password_hash):
        fail(401, "Invalid email or password")
    result = auth_response(db, user, request, response)
    audit(db, user.id, "auth.login", "user", user.id)
    return result


@router.post("/refresh", status_code=201)
def refresh(request: Request, response: Response, payload: Refresh = Refresh(), db: Session = db_dependency):
    token = payload.refreshToken or request.cookies.get(get_settings().auth_refresh_cookie_name)
    session = db.scalar(
        select(UserSession).where(UserSession.refresh_token_hash == digest(token or "")).with_for_update()
    )
    if session is None or session.revoked_at or session.expires_at <= now():
        fail(401, "Refresh token is invalid or expired")
    return auth_response(db, db.get(User, session.user_id), request, response, session)


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {**public_user(user), "createdAt": data(user)["createdAt"]}


@router.post("/logout", status_code=201)
def logout(request: Request, response: Response, payload: Refresh = Refresh(), db: Session = db_dependency):
    settings = get_settings()
    token = payload.refreshToken or request.cookies.get(settings.auth_refresh_cookie_name)
    if token:
        db.execute(
            update(UserSession)
            .where(UserSession.refresh_token_hash == digest(token), UserSession.revoked_at.is_(None))
            .values(revoked_at=now())
        )
    response.delete_cookie(
        settings.auth_refresh_cookie_name,
        path=settings.auth_refresh_cookie_path,
        secure=settings.auth_refresh_cookie_secure,
        httponly=True,
        samesite=settings.auth_refresh_cookie_same_site,
    )
    return {"revoked": True}


@router.patch("/password")
def change_password(payload: ChangePassword, user: User = Depends(current_user), db: Session = db_dependency):
    if not check_password(payload.currentPassword, user.password_hash):
        fail(401, "Current password is incorrect")
    user.password_hash = hash_password(payload.newPassword)
    db.execute(
        update(UserSession)
        .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
        .values(revoked_at=now())
    )
    audit(db, user.id, "auth.password.change", "user", user.id)
    return {"changed": True}


@router.get("/sessions")
def sessions(request: Request, user: User = Depends(current_user), db: Session = db_dependency):
    return [
        {**data(row, exclude=("userId", "refreshTokenHash")), "isCurrent": row.id == request.state.session_id}
        for row in db.scalars(
            select(UserSession)
            .where(
                UserSession.user_id == user.id,
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > now(),
            )
            .order_by(UserSession.created_at.desc())
        )
    ]


@router.delete("/sessions")
def revoke_all(user: User = Depends(current_user), db: Session = db_dependency):
    result = db.execute(
        update(UserSession)
        .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
        .values(revoked_at=now())
    )
    audit(db, user.id, "auth.session.revokeAll", "user", user.id)
    return {"revoked": result.rowcount}


@router.delete("/sessions/{session_id}")
def revoke_one(session_id: str, user: User = Depends(current_user), db: Session = db_dependency):
    result = db.execute(
        update(UserSession)
        .where(UserSession.id == session_id, UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
        .values(revoked_at=now())
    )
    if not result.rowcount:
        fail(404, "Active session not found")
    audit(db, user.id, "auth.session.revoke", "userSession", session_id)
    return {"revoked": True}


@router.post("/password/reset/request", status_code=201)
def request_reset(payload: RequestReset, db: Session = db_dependency):
    from .jobs import enqueue

    settings = get_settings()
    if not settings.smtp_host:
        fail(503, "Password reset email is not configured")
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None:
        return {"accepted": True}
    token = secrets.token_urlsafe(36)
    expiry = now() + timedelta(minutes=settings.password_reset_ttl_minutes)
    db.add(PasswordResetToken(user_id=user.id, token_hash=digest(token), expires_at=expiry))
    audit(db, user.id, "auth.passwordReset.request", "user", user.id)
    enqueue(
        db,
        user.id,
        "email",
        {
            "email": user.email,
            "displayName": user.display_name,
            "resetUrl": f"{settings.password_reset_public_url.rstrip('/')}/reset-password?token={token}",
            "expiresAt": expiry.isoformat() + "Z",
        },
    )
    return {"accepted": True}


@router.post("/password/reset/confirm", status_code=201)
def confirm_reset(payload: ResetPassword, db: Session = db_dependency):
    reset = db.scalar(
        select(PasswordResetToken)
        .where(PasswordResetToken.token_hash == digest(payload.token))
        .with_for_update()
    )
    if reset is None or reset.used_at or reset.expires_at <= now():
        fail(400, "Password reset token is invalid or expired")
    db.get(User, reset.user_id).password_hash = hash_password(payload.newPassword)
    reset.used_at = now()
    db.execute(
        update(UserSession)
        .where(UserSession.user_id == reset.user_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=now())
    )
    audit(db, reset.user_id, "auth.passwordReset.complete", "user", reset.user_id)
    return {"changed": True}
