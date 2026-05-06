package com.example.stickerplatform.data

import com.squareup.moshi.Json

data class LoginRequest(
    val email: String,
    val password: String,
)

data class AuthResponse(
    val accessToken: String,
    val user: UserDto,
)

data class UserDto(
    val id: String,
    val email: String,
    val displayName: String,
)

data class PackDto(
    val id: String,
    val name: String,
    val publisher: String,
    val description: String?,
    val isPublic: Boolean,
    val imageDataVersion: String,
    val stickerCount: Int,
    val updatedAt: String,
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
