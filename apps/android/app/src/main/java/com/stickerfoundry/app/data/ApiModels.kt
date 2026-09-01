package com.stickerfoundry.app.data

import com.squareup.moshi.Json

data class LoginRequest(
    val email: String,
    val password: String,
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
