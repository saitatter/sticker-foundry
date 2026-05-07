package com.stickerfoundry.app.data

data class ImageEditOptions(
    val rotationDegrees: Int = 0,
    val cropSquare: Boolean = false,
    val zoom: Float = 1f,
    val offsetX: Float = 0f,
    val offsetY: Float = 0f,
)
