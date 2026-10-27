from sqlalchemy import case, func, or_, select

from .common import data, fail, positive, setting
from .config import get_settings
from .models import Pack, PackMember, Sticker, Team, TeamMember, User, now


class Access:
    def __init__(self, db, user_id: str):
        self.db, self.user_id = (db, user_id)
        self.pack_roles = dict(
            db.execute(select(PackMember.pack_id, PackMember.role).where(PackMember.user_id == user_id)).all()
        )
        self.team_roles = dict(
            db.execute(select(TeamMember.team_id, TeamMember.role).where(TeamMember.user_id == user_id)).all()
        )
        for team_id in db.scalars(select(Team.id).where(Team.owner_id == user_id)):
            self.team_roles[team_id] = "OWNER"
        self.teams = {}

    def role(self, pack: Pack):
        if pack.owner_id == self.user_id:
            return "OWNER"
        return self.pack_roles.get(pack.id) or self.team_roles.get(pack.team_id)

    def get(self, pack_id: str, *, permission="view", lock=False) -> Pack:
        query = select(Pack).where(Pack.id == pack_id)
        if lock:
            query = query.with_for_update().execution_options(populate_existing=True)
        pack = self.db.scalar(query)
        if pack is None:
            fail(404, "Pack not found")
        role = self.role(pack)
        allowed = {
            "view": bool(pack.is_public or role),
            "edit": role in {"OWNER", "EDITOR"},
            "manage": role == "OWNER",
        }[permission]
        if not allowed:
            fail(
                403,
                {
                    "view": "You do not have access to this pack",
                    "edit": "Only editors can edit stickers",
                    "manage": "Only the owner can manage this pack",
                }[permission],
            )
        return pack

    def visible(self):
        return select(Pack).where(
            or_(
                Pack.owner_id == self.user_id,
                Pack.is_public.is_(True),
                Pack.id.in_(self.pack_roles),
                Pack.team_id.in_(self.team_roles),
            )
        )

    def team(self, team_id):
        if team_id and team_id not in self.teams:
            self.teams[team_id] = self.db.get(Team, team_id)
        return self.teams.get(team_id)

    def summary(self, pack, *, detail=False, counts=None):
        rows = None
        if detail or counts is None:
            rows = stickers(self.db, pack.id)
            total = len(rows)
            approved = sum(row.review_status == "APPROVED" for row in rows)
        else:
            total, approved = counts
        eligible = approved if pack.requires_approval else total
        role = self.role(pack) or ("VIEWER" if pack.is_public else None)
        team = self.team(pack.team_id)
        result = {
            **data(pack, exclude=("coverKey",)),
            "teamName": team.name if team else None,
            "stickerCount": total,
            "exportStickerCount": eligible,
            "canExport": 3 <= eligible <= 30,
            "role": role,
            "canEdit": role in {"OWNER", "EDITOR"},
            "canManage": role == "OWNER",
            "members": [{"userId": self.user_id, "role": self.pack_roles[pack.id]}]
            if pack.id in self.pack_roles
            else [],
            "team": {
                **data(team),
                "members": [{"userId": self.user_id, "role": self.team_roles[team.id]}]
                if team.id in self.team_roles
                else [],
            }
            if team
            else None,
        }
        if detail:
            result["stickers"] = [data(row) for row in rows]
        return result


def stickers(db, pack_id: str):
    return list(
        db.scalars(
            select(Sticker).where(Sticker.pack_id == pack_id).order_by(Sticker.position, Sticker.created_at)
        )
    )


def public_pack(db, pack_id: str) -> Pack:
    pack = db.get(Pack, pack_id)
    if pack is None or not pack.is_public:
        fail(404, "Public pack not found")
    return pack


def public_summary(db, pack, *, detail=False, counts=None):
    result = Access(db, "").summary(pack, detail=detail, counts=counts)
    if detail:
        result["stickers"] = [
            row
            for row in result["stickers"]
            if not pack.requires_approval or row["reviewStatus"] == "APPROVED"
        ]
        for row in result["stickers"]:
            row.pop("storageKey", None)
    return result


def pack_counts(db, ids):
    return {
        pack_id: (count, approved)
        for pack_id, count, approved in db.execute(
            select(
                Sticker.pack_id,
                func.count(),
                func.sum(case((Sticker.review_status == "APPROVED", 1), else_=0)),
            )
            .where(Sticker.pack_id.in_(ids))
            .group_by(Sticker.pack_id)
        )
    }


def team_edit(db, user_id: str, team_id: str):
    team = db.get(Team, team_id)
    if team is None:
        fail(404, "Team not found")
    role = (
        "OWNER"
        if team.owner_id == user_id
        else db.scalar(
            select(TeamMember.role).where(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
        )
    )
    if role not in {"OWNER", "EDITOR"}:
        fail(403, "Only team owners and editors can create packs in this team")


def bump(pack):
    try:
        version = int(pack.image_data_version) + 1
    except ValueError:
        version = int(now().timestamp() * 1000)
    pack.image_data_version = str(version)
    pack.updated_at = now()


def check_version(pack, header: str | None):
    if header:
        value = header.strip().removeprefix("W/").strip('"')
        if value != pack.image_data_version:
            fail(409, "Pack changed on another device. Refresh and try again.")


def quota(db, owner_id, incoming: int):
    if incoming <= 0:
        return
    limit = positive(setting(db, "storageQuotaBytes", get_settings().storage_quota_bytes))
    if limit:
        db.scalar(select(User).where(User.id == owner_id).with_for_update())
        used = db.scalar(
            select(func.coalesce(func.sum(Sticker.size_bytes), 0))
            .join(Pack, Pack.id == Sticker.pack_id)
            .where(Pack.owner_id == owner_id)
        )
        if used + incoming > limit:
            fail(400, "Storage quota exceeded for this pack owner")


def duplicate(db, pack_id, image_hash, *, ignore=None):
    query = select(Sticker.id).where(Sticker.pack_id == pack_id, Sticker.perceptual_hash == image_hash)
    if ignore:
        query = query.where(Sticker.id != ignore)
    if db.scalar(query):
        fail(400, "This image looks like a duplicate of an existing sticker in the pack")
