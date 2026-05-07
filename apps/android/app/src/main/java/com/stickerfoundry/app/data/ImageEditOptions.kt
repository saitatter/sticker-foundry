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
    val brushStrokes: List<BrushStroke> = emptyList(),
    val backgroundRemovalMode: BackgroundRemovalMode = BackgroundRemovalMode.None,
    val backgroundRemovalThreshold: Float = 240f,
    val backgroundRemovalFeather: Float = 8f,
    val backgroundRemovalCleanupSpeckles: Boolean = true,
    val backgroundRemovalSpeckleSize: Float = 48f,
)

data class BrushPoint(
    val x: Float,
    val y: Float,
)

data class BrushStroke(
    val mode: BrushMode,
    val size: Float,
    val points: List<BrushPoint>,
)

enum class BrushMode {
    Erase,
    Restore,
}

enum class BackgroundRemovalMode(val wireValue: String) {
    None("none"),
    Threshold("threshold"),
    Ai("ai"),
}

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

fun ImageEditOptions.hasBrushEdits(): Boolean =
    brushStrokes.any { it.points.isNotEmpty() }

fun ImageEditOptions.hasEdits(): Boolean =
    hasGeometryEdits() || hasColorEdits() || hasTextEdit() || hasBrushEdits()

private fun Int.floorMod(divisor: Int): Int = ((this % divisor) + divisor) % divisor
