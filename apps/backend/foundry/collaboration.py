import secrets
from datetime import UTC

from fastapi import APIRouter, Depends, Query
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from .access import Access
from .auth import current_user
from .common import audit, data, fail, public_user
from .db import db_dependency
from .models import AuditLog, PackInvite, PackMember, StickerComment, User, now
from .packs import find_sticker
from .schemas import Comment, CreateInvite, MemberRole

router = APIRouter(prefix="/packs", tags=["Collaboration"])


def actor(db, user_id):
    user = db.get(User, user_id) if user_id else None
    if user is None:
        return None
    return {key: value for key, value in public_user(user).items() if key != "isAdmin"}


def member_role(role):
    if role == "OWNER":
        fail(400, "Owner role cannot be assigned to members")


@router.get("/{pack_id}/members")
def members(pack_id: str, user: User = Depends(current_user), db: Session = db_dependency):
    Access(db, user.id).get(pack_id, permission="manage")
    rows = db.scalars(select(PackMember).where(PackMember.pack_id == pack_id).order_by(PackMember.created_at))
    return [{**data(row), "user": actor(db, row.user_id)} for row in rows]


@router.patch("/{pack_id}/members/{member_id}")
def update_member(
    pack_id: str,
    member_id: str,
    payload: MemberRole,
    user: User = Depends(current_user),
    db: Session = db_dependency,
):
    Access(db, user.id).get(pack_id, permission="manage", lock=True)
    member_role(payload.role)
    row = db.scalar(select(PackMember).where(PackMember.id == member_id, PackMember.pack_id == pack_id))
    if row is None:
        fail(404, "Member not found")
    before = data(row)
    row.role = payload.role
    db.flush()
    audit(
        db,
        user.id,
        "pack.member.update",
        "packMember",
        row.id,
        {"packId": pack_id, "before": before, "after": data(row)},
    )
    return {**data(row), "user": actor(db, row.user_id)}


@router.delete("/{pack_id}/members/{member_id}")
def remove_member(
    pack_id: str, member_id: str, user: User = Depends(current_user), db: Session = db_dependency
):
    Access(db, user.id).get(pack_id, permission="manage", lock=True)
    row = db.scalar(select(PackMember).where(PackMember.id == member_id, PackMember.pack_id == pack_id))
    if row is None:
        fail(404, "Member not found")
    before = data(row)
    db.delete(row)
    audit(
        db,
        user.id,
        "pack.member.remove",
        "packMember",
        member_id,
        {"packId": pack_id, "before": before, "after": None},
    )
    return {"deleted": True}


@router.get("/{pack_id}/invites")
def invites(pack_id: str, user: User = Depends(current_user), db: Session = db_dependency):
    Access(db, user.id).get(pack_id, permission="manage")
    rows = db.scalars(
        select(PackInvite).where(PackInvite.pack_id == pack_id).order_by(PackInvite.created_at.desc())
    )
    return [
        {**data(row), "createdBy": actor(db, row.created_by_id), "acceptedBy": actor(db, row.accepted_by_id)}
        for row in rows
    ]


@router.post("/{pack_id}/invites", status_code=201)
def create_invite(
    pack_id: str, payload: CreateInvite, user: User = Depends(current_user), db: Session = db_dependency
):
    Access(db, user.id).get(pack_id, permission="manage", lock=True)
    member_role(payload.role)
    expiry = payload.expiresAt
    if expiry:
        expiry = expiry.astimezone(UTC).replace(tzinfo=None) if expiry.tzinfo else expiry
        if expiry <= now():
            fail(400, "Invite expiration must be in the future")
    row = PackInvite(
        pack_id=pack_id,
        email=payload.email.lower() if payload.email else None,
        role=payload.role,
        code=secrets.token_urlsafe(18),
        expires_at=expiry,
        created_by_id=user.id,
    )
    db.add(row)
    db.flush()
    audit(db, user.id, "pack.invite.create", "packInvite", row.id, {"packId": pack_id, "after": data(row)})
    return data(row)


@router.delete("/{pack_id}/invites/{invite_id}")
def revoke_invite(
    pack_id: str, invite_id: str, user: User = Depends(current_user), db: Session = db_dependency
):
    Access(db, user.id).get(pack_id, permission="manage", lock=True)
    row = db.scalar(
        select(PackInvite).where(
            PackInvite.id == invite_id, PackInvite.pack_id == pack_id, PackInvite.accepted_at.is_(None)
        )
    )
    if row is None:
        fail(404, "Pending invite not found")
    before = data(row)
    db.delete(row)
    audit(
        db,
        user.id,
        "pack.invite.revoke",
        "packInvite",
        invite_id,
        {"packId": pack_id, "before": before, "after": None},
    )
    return {"deleted": True}


@router.post("/invites/{code}/accept", status_code=201)
def accept_invite(code: str, user: User = Depends(current_user), db: Session = db_dependency):
    row = db.scalar(select(PackInvite).where(PackInvite.code == code).with_for_update())
    if row is None:
        fail(404, "Invite not found")
    if row.accepted_at:
        fail(400, "Invite has already been accepted")
    if row.expires_at and row.expires_at <= now():
        fail(400, "Invite has expired")
    if row.email and row.email.lower() != user.email.lower():
        fail(403, "This invite is assigned to a different email address")
    member = db.scalar(
        select(PackMember).where(PackMember.pack_id == row.pack_id, PackMember.user_id == user.id)
    )
    if member:
        member.role = row.role
    else:
        db.add(PackMember(pack_id=row.pack_id, user_id=user.id, role=row.role))
    row.accepted_at, row.accepted_by_id = now(), user.id
    db.flush()
    audit(db, user.id, "pack.invite.accept", "packInvite", row.id, {"packId": row.pack_id, "role": row.role})
    return Access(db, user.id).summary(Access(db, user.id).get(row.pack_id), detail=True)


def activity_scope(pack_id):
    return or_(
        (AuditLog.entity_type == "pack") & (AuditLog.entity_id == pack_id),
        AuditLog.details["packId"].as_string() == pack_id,
        AuditLog.details["sourcePackId"].as_string() == pack_id,
    )


def audit_data(db, row):
    return {**data(row), "actor": actor(db, row.actor_id)}


@router.get("/{pack_id}/activity")
def activity(
    pack_id: str,
    limit: int | None = Query(default=None, ge=1, le=100),
    user: User = Depends(current_user),
    db: Session = db_dependency,
):
    Access(db, user.id).get(pack_id)
    query = select(AuditLog).where(activity_scope(pack_id)).order_by(AuditLog.created_at.desc())
    if limit:
        query = query.limit(limit)
    return [audit_data(db, row) for row in db.scalars(query)]


@router.delete("/{pack_id}/activity/{activity_id}")
def delete_activity(
    pack_id: str, activity_id: str, user: User = Depends(current_user), db: Session = db_dependency
):
    Access(db, user.id).get(pack_id, permission="manage")
    result = db.execute(delete(AuditLog).where(AuditLog.id == activity_id, activity_scope(pack_id)))
    if not result.rowcount:
        fail(404, "Activity entry not found")
    return {"deleted": True}


@router.delete("/{pack_id}/activity")
def clear_activity(pack_id: str, user: User = Depends(current_user), db: Session = db_dependency):
    Access(db, user.id).get(pack_id, permission="manage")
    result = db.execute(delete(AuditLog).where(activity_scope(pack_id)))
    return {"deleted": result.rowcount}


@router.get("/{pack_id}/stickers/{sticker_id}/comments")
def comments(pack_id: str, sticker_id: str, user: User = Depends(current_user), db: Session = db_dependency):
    Access(db, user.id).get(pack_id)
    find_sticker(db, pack_id, sticker_id)
    rows = db.scalars(
        select(StickerComment)
        .where(StickerComment.sticker_id == sticker_id)
        .order_by(StickerComment.created_at)
    )
    return [{**data(row), "user": actor(db, row.user_id)} for row in rows]


@router.post("/{pack_id}/stickers/{sticker_id}/comments", status_code=201)
def add_comment(
    pack_id: str,
    sticker_id: str,
    payload: Comment,
    user: User = Depends(current_user),
    db: Session = db_dependency,
):
    Access(db, user.id).get(pack_id)
    find_sticker(db, pack_id, sticker_id)
    body = payload.body.strip()
    if not body:
        fail(400, "Comment body is required")
    row = StickerComment(sticker_id=sticker_id, user_id=user.id, body=body)
    db.add(row)
    db.flush()
    audit(
        db,
        user.id,
        "sticker.comment.create",
        "stickerComment",
        row.id,
        {"packId": pack_id, "stickerId": sticker_id, "after": data(row)},
    )
    return {**data(row), "user": actor(db, row.user_id)}


@router.delete("/{pack_id}/stickers/{sticker_id}/comments/{comment_id}")
def delete_comment(
    pack_id: str,
    sticker_id: str,
    comment_id: str,
    user: User = Depends(current_user),
    db: Session = db_dependency,
):
    access = Access(db, user.id)
    pack = access.get(pack_id)
    find_sticker(db, pack_id, sticker_id)
    row = db.scalar(
        select(StickerComment).where(StickerComment.id == comment_id, StickerComment.sticker_id == sticker_id)
    )
    if row is None:
        fail(404, "Comment not found")
    if row.user_id != user.id and access.role(pack) != "OWNER":
        fail(403, "Only comment authors or pack owners can delete comments")
    before = data(row)
    db.delete(row)
    audit(
        db,
        user.id,
        "sticker.comment.delete",
        "stickerComment",
        comment_id,
        {"packId": pack_id, "before": before, "after": None},
    )
    return {"deleted": True}
