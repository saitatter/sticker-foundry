package com.stickerfoundry.app.data

data class ImageEditOptions(
    val rotationDegrees: Int = 0,
    val cropSquare: Boolean = false,
    val zoom: Float = 1f,
    val offsetX: Float = 0f,
    val offsetY: Float = 0f,
    val brightness: Float = 0f,
    val contrast: Float = 0f,
    val saturation: Float = 0f,
    val grayscale: Boolean = false,
    val textEnabled: Boolean = false,
    val textContent: String = "",
    val textSize: Float = 64f,
)

fun ImageEditOptions.hasGeometryEdits(): Boolean =
    rotationDegrees.floorMod(360) != 0 ||
        cropSquare ||
        zoom != 1f ||
        offsetX != 0f ||
        offsetY != 0f

fun ImageEditOptions.hasColorEdits(): Boolean =
    brightness != 0f ||
        contrast != 0f ||
        saturation != 0f ||
        grayscale

fun ImageEditOptions.hasTextEdit(): Boolean =
    textEnabled && textContent.isNotBlank()

fun ImageEditOptions.hasEdits(): Boolean =
    hasGeometryEdits() || hasColorEdits() || hasTextEdit()

private fun Int.floorMod(divisor: Int): Int = ((this % divisor) + divisor) % divisor
