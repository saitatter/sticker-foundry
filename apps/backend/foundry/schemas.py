from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Name = Annotated[str, StringConstraints(min_length=1, max_length=128)]
Email = Annotated[str, StringConstraints(pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$", max_length=254)]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
Role = Literal["VIEWER", "EDITOR", "OWNER"]
Review = Literal["PENDING", "APPROVED", "NEEDS_WORK"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Login(Input):
    email: Email
    password: str = Field(min_length=1, max_length=128, repr=False)


class Register(Login):
    password: Password = Field(repr=False)
    displayName: Name
    inviteCode: str | None = None


class Refresh(Input):
    refreshToken: str | None = Field(default=None, repr=False)


class ChangePassword(Input):
    currentPassword: str = Field(min_length=1, repr=False)
    newPassword: Password = Field(repr=False)


class RequestReset(Input):
    email: Email


class ResetPassword(Input):
    token: str = Field(min_length=1, repr=False)
    newPassword: Password = Field(repr=False)


class CreatePack(Input):
    name: Name
    publisher: Name
    description: str | None = Field(default=None, max_length=500)
    isPublic: bool = False
    requiresApproval: bool = False
    isAnimated: bool = False
    teamId: str | None = None


class UpdatePack(Input):
    name: Name | None = None
    publisher: Name | None = None
    description: str | None = Field(default=None, max_length=500)
    isPublic: bool | None = None
    requiresApproval: bool | None = None
    isAnimated: bool | None = None


class UpdateSticker(Input):
    emojis: list[str] | None = Field(default=None, max_length=3)
    accessibilityText: str | None = Field(default=None, max_length=125)
    reviewStatus: Review | None = None


class StickerIds(Input):
    stickerIds: list[str] = Field(min_length=1, max_length=30)


class Transfer(StickerIds):
    targetPackId: str


class MemberRole(Input):
    role: Role


class CreateInvite(MemberRole):
    email: Email | None = None
    expiresAt: datetime | None = None


class Comment(Input):
    body: str = Field(min_length=1, max_length=1000)


class CreateTeam(Input):
    name: Name
    description: str | None = Field(default=None, max_length=500)


class AddTeamMember(MemberRole):
    email: Email


class UpdateSettings(Input):
    registrationMode: Literal["open", "invite-only", "disabled"] | None = None
    registrationInviteCode: str | None = None
    storageQuotaBytes: int | None = Field(default=None, ge=1, le=10_995_116_277_760)
    auditRetentionDays: int | None = Field(default=None, ge=1, le=3650)
    instanceName: Name | None = None
    instanceDescription: str | None = None


class MediaOptions(Input):
    emojis: list[str] | None = Field(default=None, max_length=3)
    accessibilityText: str | None = Field(default=None, max_length=125)
    backgroundRemovalMode: Literal["none", "threshold", "ai"] = "ai"
    backgroundRemovalThreshold: int = Field(default=238, ge=180, le=255)
    backgroundRemovalFeather: int = Field(default=14, ge=0, le=48)
    backgroundRemovalCleanupSpeckles: bool = True
    backgroundRemovalSpeckleSize: int = Field(default=24, ge=4, le=180)
    animatedTrimStart: float | None = Field(default=None, ge=0)
    animatedTrimEnd: float | None = Field(default=None, gt=0)
    animatedFrameRate: int | None = Field(default=None, ge=1, le=30)
    animatedQuality: int | None = Field(default=None, ge=35, le=95)
    staticQuality: int | None = Field(default=None, ge=35, le=95)
