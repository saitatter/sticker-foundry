package com.stickerfoundry.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.stickerfoundry.app.data.BackgroundRemovalMode
import com.stickerfoundry.app.data.BrushMode
import com.stickerfoundry.app.data.BrushPoint
import com.stickerfoundry.app.data.BrushStroke
import com.stickerfoundry.app.data.ImageEditOptions
import com.stickerfoundry.app.data.ImageEditRenderer
import com.stickerfoundry.app.data.hasEdits

@Composable
fun ImageEditDialog(
    edit: PendingImageEdit,
    onDismiss: () -> Unit,
    onSubmit: (ImageEditOptions) -> Unit,
) {
    val context = LocalContext.current
    val previewSource = remember(edit.uri) { loadBitmap(context, edit.uri) }
    val sourceInfo = remember(edit.uri) { imageSourceInfo(context, edit.uri) }
    val state = remember(edit.uri) { ImageEditDialogState() }
    val title = when (edit.target) {
        ImageEditTarget.Sticker -> "Edit sticker"
        ImageEditTarget.TrayIcon -> "Edit tray icon"
    }
    val currentOptions = state.options(edit)
    val estimatedBytes = sourceInfo?.let {
        estimateEditedBytes(it, currentOptions)
    }
    val preview = remember(previewSource, currentOptions) {
        previewSource?.let { ImageEditRenderer.render(it, currentOptions).asImageBitmap() }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            ImageEditDialogContent(edit, state, preview, estimatedBytes)
        },
        confirmButton = {
            Button(
                onClick = {
                    onSubmit(currentOptions)
                },
            ) {
                Text("Upload")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
    )
}

private class ImageEditDialogState {
    var rotation by mutableStateOf(0)
    var cropSquare by mutableStateOf(false)
    var zoom by mutableStateOf(1f)
    var offsetX by mutableStateOf(0f)
    var offsetY by mutableStateOf(0f)
    var brightness by mutableStateOf(0f)
    var contrast by mutableStateOf(0f)
    var saturation by mutableStateOf(0f)
    var grayscale by mutableStateOf(false)
    var textEnabled by mutableStateOf(false)
    var textContent by mutableStateOf("")
    var textSize by mutableStateOf(64f)
    var brushEnabled by mutableStateOf(false)
    var brushMode by mutableStateOf(BrushMode.Erase)
    var brushSize by mutableStateOf(36f)
    var brushStrokes by mutableStateOf<List<BrushStroke>>(emptyList())
    var undoneBrushStrokes by mutableStateOf<List<BrushStroke>>(emptyList())
    var activeBrushPoints by mutableStateOf<List<BrushPoint>>(emptyList())
    var backgroundRemovalMode by mutableStateOf(BackgroundRemovalMode.None)
    var backgroundRemovalThreshold by mutableStateOf(240f)
    var backgroundRemovalFeather by mutableStateOf(8f)
    var backgroundRemovalCleanupSpeckles by mutableStateOf(true)
    var backgroundRemovalSpeckleSize by mutableStateOf(48f)
    var animatedOptionsEnabled by mutableStateOf(false)
    var animatedTrimStart by mutableStateOf(0f)
    var animatedTrimEnd by mutableStateOf(10f)
    var animatedFrameRate by mutableStateOf(15f)
    var animatedQuality by mutableStateOf(80f)

    fun options(edit: PendingImageEdit) = ImageEditOptions(
        rotationDegrees = rotation,
        cropSquare = cropSquare,
        zoom = zoom,
        offsetX = offsetX,
        offsetY = offsetY,
        brightness = brightness,
        contrast = contrast,
        saturation = saturation,
        grayscale = grayscale,
        textEnabled = textEnabled,
        textContent = textContent,
        textSize = textSize,
        brushStrokes = previewBrushStrokes(),
        backgroundRemovalMode = if (edit.target == ImageEditTarget.Sticker) backgroundRemovalMode else BackgroundRemovalMode.None,
        backgroundRemovalThreshold = backgroundRemovalThreshold,
        backgroundRemovalFeather = backgroundRemovalFeather,
        backgroundRemovalCleanupSpeckles = backgroundRemovalCleanupSpeckles,
        backgroundRemovalSpeckleSize = backgroundRemovalSpeckleSize,
        animatedTrimStart = if (edit.isAnimated && animatedOptionsEnabled) animatedTrimStart else null,
        animatedTrimEnd = if (edit.isAnimated && animatedOptionsEnabled) animatedTrimEnd else null,
        animatedFrameRate = if (edit.isAnimated && animatedOptionsEnabled) animatedFrameRate else null,
        animatedQuality = if (edit.isAnimated && animatedOptionsEnabled) animatedQuality else null,
    )

    fun updateCropSquare(enabled: Boolean) {
        cropSquare = enabled
        if (!enabled) {
            zoom = 1f
            offsetX = 0f
            offsetY = 0f
        }
    }

    fun updateTextEnabled(enabled: Boolean) {
        textEnabled = enabled
        if (!enabled) textContent = ""
    }

    fun updateBrushEnabled(enabled: Boolean) {
        brushEnabled = enabled
        activeBrushPoints = emptyList()
    }

    fun applyCleanPreset() {
        cropSquare = true
        zoom = 1.15f
        brightness = 2f
        contrast = 10f
        saturation = 6f
        backgroundRemovalMode = BackgroundRemovalMode.Threshold
        backgroundRemovalThreshold = 240f
        backgroundRemovalFeather = 8f
        backgroundRemovalCleanupSpeckles = true
        backgroundRemovalSpeckleSize = 48f
    }

    fun applyMemePreset() {
        cropSquare = true
        zoom = 1.2f
        brightness = 0f
        contrast = 18f
        saturation = 16f
        textEnabled = true
        textSize = 72f
        backgroundRemovalMode = BackgroundRemovalMode.Ai
        backgroundRemovalThreshold = 236f
        backgroundRemovalFeather = 10f
        backgroundRemovalCleanupSpeckles = true
        backgroundRemovalSpeckleSize = 56f
    }

    fun reset() {
        rotation = 0
        cropSquare = false
        zoom = 1f
        offsetX = 0f
        offsetY = 0f
        brightness = 0f
        contrast = 0f
        saturation = 0f
        grayscale = false
        textEnabled = false
        textContent = ""
        textSize = 64f
        brushEnabled = false
        brushStrokes = emptyList()
        undoneBrushStrokes = emptyList()
        activeBrushPoints = emptyList()
        backgroundRemovalMode = BackgroundRemovalMode.None
        animatedOptionsEnabled = false
    }

    fun startBrush(point: BrushPoint) {
        activeBrushPoints = listOf(point)
    }

    fun addBrushPoint(point: BrushPoint) {
        activeBrushPoints = activeBrushPoints + point
    }

    fun finishBrush() {
        if (activeBrushPoints.isEmpty()) return
        brushStrokes = brushStrokes + BrushStroke(brushMode, brushSize, activeBrushPoints)
        undoneBrushStrokes = emptyList()
        activeBrushPoints = emptyList()
    }

    fun cancelBrush() {
        activeBrushPoints = emptyList()
    }

    fun undoBrush() {
        val last = brushStrokes.lastOrNull() ?: return
        brushStrokes = brushStrokes.dropLast(1)
        undoneBrushStrokes = undoneBrushStrokes + last
    }

    fun redoBrush() {
        val last = undoneBrushStrokes.lastOrNull() ?: return
        undoneBrushStrokes = undoneBrushStrokes.dropLast(1)
        brushStrokes = brushStrokes + last
    }

    private fun previewBrushStrokes() =
        if (activeBrushPoints.isEmpty()) brushStrokes else brushStrokes + BrushStroke(brushMode, brushSize, activeBrushPoints)
}

@Composable
private fun ImageEditDialogContent(
    edit: PendingImageEdit,
    state: ImageEditDialogState,
    preview: ImageBitmap?,
    estimatedBytes: Long?,
) {
    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ImageEditPreview(preview, state)
        PresetSection(state)
        TransformSection(state)
        ColorSection(state)
        TextSection(state)
        BrushSection(state)
        BackgroundRemovalSection(edit, state)
        AnimatedSection(edit, state)
        Text(
            text = estimatedBytes?.let { "Estimated upload: ~${formatBytes(it)}" } ?: "Estimated upload: unavailable",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun ImageEditPreview(preview: ImageBitmap?, state: ImageEditDialogState) {
    if (preview == null) return

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(220.dp)
            .clipToBounds(),
    ) {
        Image(
            bitmap = preview,
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Fit,
        )
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(state.brushEnabled, state.brushMode, state.brushSize, preview.width, preview.height) {
                    if (!state.brushEnabled) return@pointerInput
                    fun normalized(offset: Offset): BrushPoint {
                        val boxWidth = size.width.toFloat().coerceAtLeast(1f)
                        val boxHeight = size.height.toFloat().coerceAtLeast(1f)
                        val scale = minOf(
                            boxWidth / preview.width.coerceAtLeast(1),
                            boxHeight / preview.height.coerceAtLeast(1),
                        )
                        val imageWidth = preview.width * scale
                        val imageHeight = preview.height * scale
                        val imageLeft = (boxWidth - imageWidth) / 2f
                        val imageTop = (boxHeight - imageHeight) / 2f
                        return BrushPoint(
                            x = ((offset.x - imageLeft) / imageWidth.coerceAtLeast(1f)).coerceIn(0f, 1f),
                            y = ((offset.y - imageTop) / imageHeight.coerceAtLeast(1f)).coerceIn(0f, 1f),
                        )
                    }

                    detectDragGestures(
                        onDragStart = { offset -> state.startBrush(normalized(offset)) },
                        onDrag = { change, _ ->
                            state.addBrushPoint(normalized(change.position))
                            change.consume()
                        },
                        onDragEnd = { state.finishBrush() },
                        onDragCancel = { state.cancelBrush() },
                    )
                },
        ) {
            if (state.brushEnabled) {
                drawRect(Color.Transparent)
            }
        }
    }
}

@Composable
private fun PresetSection(state: ImageEditDialogState) {
    Text("Presets", style = MaterialTheme.typography.bodySmall)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = { state.applyCleanPreset() }) {
            Text("Clean")
        }
        TextButton(onClick = { state.applyMemePreset() }) {
            Text("Meme")
        }
        TextButton(onClick = { state.reset() }) {
            Text("Reset")
        }
    }
}

@Composable
private fun TransformSection(state: ImageEditDialogState) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = { state.rotation = (state.rotation + 270) % 360 }) {
            Text("Rotate left")
        }
        TextButton(onClick = { state.rotation = (state.rotation + 90) % 360 }) {
            Text("Rotate right")
        }
    }
    EditorCheckbox("Square crop", state.cropSquare) { state.updateCropSquare(it) }
    if (state.cropSquare) {
        Text("Zoom", style = MaterialTheme.typography.bodySmall)
        Slider(value = state.zoom, onValueChange = { state.zoom = it }, valueRange = 1f..3f)
        Text("Horizontal", style = MaterialTheme.typography.bodySmall)
        Slider(value = state.offsetX, onValueChange = { state.offsetX = it }, valueRange = -100f..100f)
        Text("Vertical", style = MaterialTheme.typography.bodySmall)
        Slider(value = state.offsetY, onValueChange = { state.offsetY = it }, valueRange = -100f..100f)
    }
}

@Composable
private fun ColorSection(state: ImageEditDialogState) {
    Text("Brightness", style = MaterialTheme.typography.bodySmall)
    Slider(value = state.brightness, onValueChange = { state.brightness = it }, valueRange = -100f..100f)
    Text("Contrast", style = MaterialTheme.typography.bodySmall)
    Slider(value = state.contrast, onValueChange = { state.contrast = it }, valueRange = -100f..100f)
    Text("Saturation", style = MaterialTheme.typography.bodySmall)
    Slider(value = state.saturation, onValueChange = { state.saturation = it }, valueRange = -100f..100f)
    EditorCheckbox("Grayscale", state.grayscale) { state.grayscale = it }
}

@Composable
private fun TextSection(state: ImageEditDialogState) {
    EditorCheckbox("Text", state.textEnabled) { state.updateTextEnabled(it) }
    if (state.textEnabled) {
        OutlinedTextField(
            value = state.textContent,
            onValueChange = { state.textContent = it.take(80) },
            label = { Text("Sticker text") },
            singleLine = true,
        )
        Text("Text size", style = MaterialTheme.typography.bodySmall)
        Slider(value = state.textSize, onValueChange = { state.textSize = it }, valueRange = 18f..140f)
    }
}

@Composable
private fun BrushSection(state: ImageEditDialogState) {
    EditorCheckbox("Brush", state.brushEnabled) { state.updateBrushEnabled(it) }
    if (!state.brushEnabled) return

    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = { state.brushMode = BrushMode.Erase }) {
            Text(if (state.brushMode == BrushMode.Erase) "Erase *" else "Erase")
        }
        TextButton(onClick = { state.brushMode = BrushMode.Restore }) {
            Text(if (state.brushMode == BrushMode.Restore) "Restore *" else "Restore")
        }
    }
    Text("Brush size", style = MaterialTheme.typography.bodySmall)
    Slider(value = state.brushSize, onValueChange = { state.brushSize = it }, valueRange = 8f..96f)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(enabled = state.brushStrokes.isNotEmpty(), onClick = { state.undoBrush() }) {
            Text("Undo")
        }
        TextButton(enabled = state.undoneBrushStrokes.isNotEmpty(), onClick = { state.redoBrush() }) {
            Text("Redo")
        }
    }
}

@Composable
private fun BackgroundRemovalSection(edit: PendingImageEdit, state: ImageEditDialogState) {
    if (edit.target != ImageEditTarget.Sticker) return

    Text("Server background", style = MaterialTheme.typography.bodySmall)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = { state.backgroundRemovalMode = BackgroundRemovalMode.None }) {
            Text(if (state.backgroundRemovalMode == BackgroundRemovalMode.None) "None *" else "None")
        }
        TextButton(onClick = { state.backgroundRemovalMode = BackgroundRemovalMode.Threshold }) {
            Text(if (state.backgroundRemovalMode == BackgroundRemovalMode.Threshold) "Threshold *" else "Threshold")
        }
        TextButton(onClick = { state.backgroundRemovalMode = BackgroundRemovalMode.Ai }) {
            Text(if (state.backgroundRemovalMode == BackgroundRemovalMode.Ai) "AI *" else "AI")
        }
    }
    if (state.backgroundRemovalMode == BackgroundRemovalMode.None) return

    Text("Threshold", style = MaterialTheme.typography.bodySmall)
    Slider(
        value = state.backgroundRemovalThreshold,
        onValueChange = { state.backgroundRemovalThreshold = it },
        valueRange = 180f..255f,
    )
    Text("Feather", style = MaterialTheme.typography.bodySmall)
    Slider(
        value = state.backgroundRemovalFeather,
        onValueChange = { state.backgroundRemovalFeather = it },
        valueRange = 0f..48f,
    )
    EditorCheckbox("Cleanup speckles", state.backgroundRemovalCleanupSpeckles) {
        state.backgroundRemovalCleanupSpeckles = it
    }
    Text("Speckle size", style = MaterialTheme.typography.bodySmall)
    Slider(
        value = state.backgroundRemovalSpeckleSize,
        onValueChange = { state.backgroundRemovalSpeckleSize = it },
        valueRange = 4f..180f,
    )
}

@Composable
private fun AnimatedSection(edit: PendingImageEdit, state: ImageEditDialogState) {
    if (edit.target != ImageEditTarget.Sticker || !edit.isAnimated) return

    EditorCheckbox("Animated controls", state.animatedOptionsEnabled) {
        state.animatedOptionsEnabled = it
    }
    if (!state.animatedOptionsEnabled) return

    Text("Trim start", style = MaterialTheme.typography.bodySmall)
    Slider(
        value = state.animatedTrimStart,
        onValueChange = { state.animatedTrimStart = minOf(it, state.animatedTrimEnd - 0.1f).coerceAtLeast(0f) },
        valueRange = 0f..10f,
    )
    Text("Trim end", style = MaterialTheme.typography.bodySmall)
    Slider(
        value = state.animatedTrimEnd,
        onValueChange = { state.animatedTrimEnd = maxOf(it, state.animatedTrimStart + 0.1f).coerceAtMost(10f) },
        valueRange = 0.1f..10f,
    )
    Text("Frame rate", style = MaterialTheme.typography.bodySmall)
    Slider(value = state.animatedFrameRate, onValueChange = { state.animatedFrameRate = it }, valueRange = 1f..30f)
    Text("Animated quality", style = MaterialTheme.typography.bodySmall)
    Slider(value = state.animatedQuality, onValueChange = { state.animatedQuality = it }, valueRange = 35f..95f)
}

@Composable
private fun EditorCheckbox(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Checkbox(checked = checked, onCheckedChange = onCheckedChange)
        Text(label)
    }
}

enum class ImageEditTarget {
    Sticker,
    TrayIcon,
}

data class PendingImageEdit(
    val packId: String,
    val uri: Uri,
    val target: ImageEditTarget,
    val isAnimated: Boolean = false,
)

private data class ImageSourceInfo(
    val width: Int,
    val height: Int,
    val bytes: Long,
)

// PNG edits can grow beyond the source bytes; this cushions the estimate shown before upload.
private const val EDITED_UPLOAD_ESTIMATE_OVERHEAD = 1.25

// Transparent sticker PNGs usually compress well; this prevents tiny estimates for large canvases.
private const val MIN_EDITED_UPLOAD_BYTES_PER_PIXEL = 0.16

private fun loadBitmap(context: Context, uri: Uri): Bitmap? =
    context.contentResolver.openInputStream(uri)?.use { input ->
        BitmapFactory.decodeStream(input)
    }

fun loadImageBitmap(path: String): ImageBitmap? =
    BitmapFactory.decodeFile(path)?.asImageBitmap()

private fun imageSourceInfo(context: Context, uri: Uri): ImageSourceInfo? {
    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri)?.use { input ->
        BitmapFactory.decodeStream(input, null, options)
    }
    if (options.outWidth <= 0 || options.outHeight <= 0) return null

    val bytes = context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { descriptor ->
        descriptor.length.takeIf { it > 0 }
    } ?: context.contentResolver.openInputStream(uri)?.use { input ->
        input.readBytes().size.toLong()
    } ?: 0L

    return ImageSourceInfo(options.outWidth, options.outHeight, bytes)
}

private fun estimateEditedBytes(source: ImageSourceInfo, options: ImageEditOptions): Long {
    if (!options.hasEdits()) return source.bytes

    val sourcePixels = source.width.toLong() * source.height.toLong()
    val outputPixels = if (options.cropSquare) {
        val baseSize = minOf(source.width, source.height)
        val size = (baseSize / options.zoom.coerceAtLeast(1f)).toLong().coerceAtLeast(1L)
        size * size
    } else {
        sourcePixels
    }
    val pixelRatio = outputPixels.toDouble() / sourcePixels.coerceAtLeast(1L).toDouble()
    val estimated = maxOf(
        source.bytes * pixelRatio * EDITED_UPLOAD_ESTIMATE_OVERHEAD,
        outputPixels * MIN_EDITED_UPLOAD_BYTES_PER_PIXEL,
    )
    return estimated.toLong().coerceAtLeast(1L)
}

private fun formatBytes(bytes: Long): String =
    if (bytes < 1024) {
        "$bytes B"
    } else {
        "${(bytes + 1023) / 1024} KB"
    }
