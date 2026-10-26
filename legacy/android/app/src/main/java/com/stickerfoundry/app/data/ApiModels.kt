package com.stickerfoundry.app.data

import com.squareup.moshi.Json

data class LoginRequest(
    val email: String,
    val password: String,
)

data class RegisterRequest(
    val email: String,
    val displayName: String,
    val password: String,
    val inviteCode: String? = null,
)

data class ChangePasswordRequest(
    val currentPassword: String,
    val newPassword: String,
)

data class PasswordResetRequest(val email: String)

data class PasswordResetConfirmRequest(
    val token: String,
    val newPassword: String,
)

data class AuthResponse(
    val accessToken: String,
    val refreshToken: String,
    val user: UserDto,
)

data class RefreshTokenRequest(
    val refreshToken: String,
)

data class JobDto(
    val id: String,
    val status: String,
    val progress: Int,
    val error: String? = null,
    val result: JobResultDto? = null,
)

data class JobResultDto(
    val packId: String? = null,
    val contentHash: String? = null,
    val downloadPath: String? = null,
    val storageKey: String? = null,
    val sizeBytes: Long? = null,
    val sha256: String? = null,
)

data class HealthResponse(
    val status: String,
    val version: String? = null,
)

data class UserDto(
    val id: String,
    val email: String,
    val displayName: String,
    val isAdmin: Boolean = false,
)

data class PackDto(
    val id: String,
    val name: String,
    val publisher: String,
    val description: String?,
    val isPublic: Boolean,
    val isAnimated: Boolean = false,
    val imageDataVersion: String,
    val stickerCount: Int,
    val updatedAt: String,
    val requiresApproval: Boolean = false,
    val teamId: String? = null,
    val teamName: String? = null,
    val role: String? = null,
    val canEdit: Boolean? = null,
    val canManage: Boolean? = null,
    val exportStickerCount: Int? = null,
    val canExport: Boolean? = null,
    val stickers: List<StickerDto> = emptyList(),
)

data class PackDetailDto(
    val id: String,
    val name: String,
    val publisher: String,
    val description: String? = null,
    val isPublic: Boolean,
    val requiresApproval: Boolean = false,
    val isAnimated: Boolean = false,
    val teamId: String? = null,
    val teamName: String? = null,
    val imageDataVersion: String,
    val stickerCount: Int,
    val exportStickerCount: Int? = null,
    val canExport: Boolean? = null,
    val role: String? = null,
    val canEdit: Boolean? = null,
    val canManage: Boolean? = null,
    val updatedAt: String,
    val stickers: List<StickerDto> = emptyList(),
)

data class StickerDto(
    val id: String,
    val fileName: String,
    val mimeType: String = "image/webp",
    val width: Int = 0,
    val height: Int = 0,
    val emojis: List<String> = emptyList(),
    val accessibilityText: String? = null,
    val sizeBytes: Long = 0,
    val sha256: String = "",
    val perceptualHash: String? = null,
    val position: Int = 0,
    val reviewStatus: String = "PENDING",
    val createdAt: String = "",
)

data class StickerCommentDto(
    val id: String,
    val stickerId: String,
    val userId: String,
    val body: String,
    val createdAt: String = "",
    val updatedAt: String = "",
    val user: UserDto,
)

data class CreateCommentRequest(val body: String)

data class PackMemberDto(
    val id: String,
    val packId: String,
    val userId: String,
    val role: String,
    val user: UserDto,
)

data class PackInviteDto(
    val id: String,
    val packId: String,
    val email: String? = null,
    val role: String,
    val code: String,
    val expiresAt: String? = null,
    val acceptedAt: String? = null,
    val createdAt: String = "",
    val createdBy: UserDto? = null,
    val acceptedBy: UserDto? = null,
)

data class AuditLogEntryDto(
    val id: String,
    val actorId: String? = null,
    val action: String,
    val entityType: String,
    val entityId: String? = null,
    val requestId: String? = null,
    val metadata: Any? = null,
    val ipAddress: String? = null,
    val userAgent: String? = null,
    val createdAt: String = "",
    val actor: UserDto? = null,
)

data class TeamDto(
    val id: String,
    val name: String,
    val description: String? = null,
    val role: String? = null,
    val memberCount: Int = 0,
    val packCount: Int = 0,
    val canManage: Boolean = false,
    val createdAt: String = "",
    val updatedAt: String = "",
)

data class TeamMemberDto(
    val id: String,
    val teamId: String,
    val userId: String,
    val role: String,
    val user: UserDto,
)

data class UserSessionDto(
    val id: String,
    val createdAt: String,
    val expiresAt: String,
    val revokedAt: String? = null,
)

data class BackgroundRemovalStatusDto(
    val thresholdAvailable: Boolean = true,
    val aiCommandConfigured: Boolean = false,
    val aiMode: String? = null,
    val fallbackMode: String = "threshold",
)

data class AdminSettingsDto(
    val registrationMode: String,
    val registrationInviteCode: String = "",
    val storageQuotaBytes: Long? = null,
    val auditRetentionDays: Int? = null,
    val instanceName: String,
    val instanceDescription: String,
    val backgroundRemoval: BackgroundRemovalStatusDto? = null,
)

data class UpdateAdminSettingsRequest(
    val registrationMode: String? = null,
    val registrationInviteCode: String? = null,
    val storageQuotaBytes: Long? = null,
    val auditRetentionDays: Int? = null,
    val instanceName: String? = null,
    val instanceDescription: String? = null,
)

data class InstanceSettingsDto(
    val instanceName: String,
    val instanceDescription: String,
)

data class CreatePackRequest(
    val name: String,
    val publisher: String,
    val description: String? = null,
    val isPublic: Boolean = false,
    val requiresApproval: Boolean = false,
    val isAnimated: Boolean = false,
    val teamId: String? = null,
)

data class UpdatePackRequest(
    val name: String? = null,
    val publisher: String? = null,
    val description: String? = null,
    val isPublic: Boolean? = null,
    val requiresApproval: Boolean? = null,
    val isAnimated: Boolean? = null,
)

data class UpdateStickerRequest(
    val emojis: List<String>? = null,
    val accessibilityText: String? = null,
    val reviewStatus: String? = null,
)

data class CreateInviteRequest(
    val role: String,
    val email: String? = null,
    val expiresAt: String? = null,
)

data class RoleRequest(val role: String)

data class ReorderStickersRequest(val stickerIds: List<String>)

data class TransferStickersRequest(
    val targetPackId: String,
    val stickerIds: List<String>,
)

data class CreateTeamRequest(
    val name: String,
    val description: String? = null,
)

data class AddTeamMemberRequest(
    val email: String,
    val role: String,
)

data class SyncPacksResponse(
    val serverTime: String,
    val packs: List<SyncPackDto>,
)

data class SyncPackDto(
    val id: String,
    val name: String,
    val publisher: String,
    val description: String?,
    val isPublic: Boolean,
    val isAnimated: Boolean = false,
    val isOwner: Boolean,
    val teamId: String?,
    val teamName: String?,
    val role: String?,
    val canEdit: Boolean?,
    val canManage: Boolean?,
    val imageDataVersion: String,
    val stickerCount: Int,
    val canExport: Boolean,
    val updatedAt: String,
    val contentHash: String?,
    val syncHash: String,
    val exportPath: String,
    val trayIconPath: String,
)

data class PackManifestDto(
    val id: String,
    val name: String,
    val publisher: String,
    val requiresApproval: Boolean,
    val isAnimated: Boolean = false,
    val imageDataVersion: String,
    val stickerCount: Int,
    val canExport: Boolean,
    val contentHash: String,
    val exportPath: String,
    val trayIconPath: String,
)

data class ContentsJson(
    @Json(name = "sticker_packs") val stickerPacks: List<StickerPackJson>,
)

data class StickerPackJson(
    val identifier: String,
    val name: String,
    val publisher: String,
    @Json(name = "tray_image_file") val trayImageFile: String,
    @Json(name = "image_data_version") val imageDataVersion: String,
    @Json(name = "animated_sticker_pack") val animatedStickerPack: Boolean?,
    val stickers: List<StickerJson>,
)

data class StickerJson(
    @Json(name = "image_file") val imageFile: String,
    val emojis: List<String>,
    @Json(name = "accessibility_text") val accessibilityText: String?,
)
