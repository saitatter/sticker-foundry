from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .auth import current_user
from .collaboration import actor, member_role
from .common import audit, data, fail
from .db import db_dependency
from .models import Pack, Team, TeamMember, User
from .schemas import AddTeamMember, CreateTeam, MemberRole

router = APIRouter(prefix="/teams", tags=["Teams"])


def managed_team(db, user_id, team_id):
    row = db.scalar(select(Team).where(Team.id == team_id).with_for_update())
    if row is None:
        fail(404, "Team not found")
    role = db.scalar(
        select(TeamMember.role).where(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
    )
    if row.owner_id != user_id and role != "OWNER":
        fail(403, "Only team owners can manage members")
    return row


def team_summary(db, row, user_id, role):
    return {
        **data(row),
        "role": role,
        "canManage": role == "OWNER",
        "memberCount": db.scalar(
            select(func.count()).select_from(TeamMember).where(TeamMember.team_id == row.id)
        ),
        "packCount": db.scalar(select(func.count()).select_from(Pack).where(Pack.team_id == row.id)),
    }


@router.get("")
def list_teams(user: User = Depends(current_user), db: Session = db_dependency):
    roles = dict(
        db.execute(select(TeamMember.team_id, TeamMember.role).where(TeamMember.user_id == user.id)).all()
    )
    rows = db.scalars(
        select(Team).where(or_(Team.owner_id == user.id, Team.id.in_(roles))).order_by(Team.name)
    )
    return [
        team_summary(db, row, user.id, "OWNER" if row.owner_id == user.id else roles[row.id]) for row in rows
    ]


@router.post("", status_code=201)
def create_team(payload: CreateTeam, user: User = Depends(current_user), db: Session = db_dependency):
    row = Team(name=payload.name, description=payload.description, owner_id=user.id)
    db.add(row)
    db.flush()
    db.add(TeamMember(team_id=row.id, user_id=user.id, role="OWNER"))
    db.flush()
    audit(db, user.id, "team.create", "team", row.id)
    return team_summary(db, row, user.id, "OWNER")


@router.get("/{team_id}/members")
def members(team_id: str, user: User = Depends(current_user), db: Session = db_dependency):
    managed_team(db, user.id, team_id)
    rows = db.scalars(select(TeamMember).where(TeamMember.team_id == team_id).order_by(TeamMember.created_at))
    return [{**data(row), "user": actor(db, row.user_id)} for row in rows]


@router.post("/{team_id}/members", status_code=201)
def add_member(
    team_id: str, payload: AddTeamMember, user: User = Depends(current_user), db: Session = db_dependency
):
    team = managed_team(db, user.id, team_id)
    member_role(payload.role)
    target = db.scalar(select(User).where(User.email == payload.email.lower()))
    if target is None:
        fail(404, "User not found")
    if target.id == team.owner_id:
        fail(400, "The team owner cannot be demoted")
    row = db.scalar(select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == target.id))
    if row is None:
        row = TeamMember(team_id=team_id, user_id=target.id, role=payload.role)
        db.add(row)
    else:
        row.role = payload.role
    db.flush()
    audit(db, user.id, "team.member.add", "teamMember", row.id, {"teamId": team_id, "after": data(row)})
    return {**data(row), "user": actor(db, row.user_id)}


def team_member(db, team, member_id):
    row = db.scalar(select(TeamMember).where(TeamMember.id == member_id, TeamMember.team_id == team.id))
    if row is None:
        fail(404, "Team member not found")
    if row.user_id == team.owner_id or row.role == "OWNER":
        fail(400, "The team owner cannot be changed")
    return row


@router.patch("/{team_id}/members/{member_id}")
def update_member(
    team_id: str,
    member_id: str,
    payload: MemberRole,
    user: User = Depends(current_user),
    db: Session = db_dependency,
):
    team = managed_team(db, user.id, team_id)
    member_role(payload.role)
    row = team_member(db, team, member_id)
    before = data(row)
    row.role = payload.role
    db.flush()
    audit(
        db,
        user.id,
        "team.member.update",
        "teamMember",
        row.id,
        {"teamId": team_id, "before": before, "after": data(row)},
    )
    return {**data(row), "user": actor(db, row.user_id)}


@router.delete("/{team_id}/members/{member_id}")
def remove_member(
    team_id: str, member_id: str, user: User = Depends(current_user), db: Session = db_dependency
):
    team = managed_team(db, user.id, team_id)
    row = team_member(db, team, member_id)
    before = data(row)
    db.delete(row)
    audit(
        db,
        user.id,
        "team.member.remove",
        "teamMember",
        member_id,
        {"teamId": team_id, "before": before, "after": None},
    )
    return {"deleted": True}
