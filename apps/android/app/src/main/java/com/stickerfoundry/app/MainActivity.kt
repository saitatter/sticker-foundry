package com.stickerfoundry.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.stickerfoundry.app.data.EXTRACTION_FAILED
import com.stickerfoundry.app.data.EXTRACTION_READY
import com.stickerfoundry.app.data.EXTRACTION_SYNCING
import com.stickerfoundry.app.data.BrushMode
import com.stickerfoundry.app.data.BrushPoint
import com.stickerfoundry.app.data.BrushStroke
import com.stickerfoundry.app.data.ImageEditOptions
import com.stickerfoundry.app.data.ImageEditRenderer
import com.stickerfoundry.app.data.PackEntity
import com.stickerfoundry.app.data.StickerEntity
import com.stickerfoundry.app.data.hasEdits
import com.stickerfoundry.app.whatsapp.WhatsAppStickerLauncher
import java.io.File

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    StickerApp()
                }
            }
        }
    }
}

@Composable
private fun StickerApp(viewModel: StickerViewModel = viewModel(factory = StickerViewModel.factory(LocalContext.current))) {
    val packs by viewModel.packs.collectAsState()
    val stickersByPack by viewModel.stickersByPack.collectAsState()
    val status by viewModel.status.collectAsState()
    val serverUrl by viewModel.serverUrl.collectAsState()
    val account by viewModel.account.collectAsState()
    val cacheUsage by viewModel.cacheUsage.collectAsState()
    val context = LocalContext.current
    var stickerUploadPackId by remember { mutableStateOf<String?>(null) }
    var trayIconPackId by remember { mutableStateOf<String?>(null) }
    var pendingEdit by remember { mutableStateOf<PendingImageEdit?>(null) }
    var showSettings by remember { mutableStateOf(false) }
    var showTroubleshooting by remember { mutableStateOf(false) }
    val stickerPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val packId = stickerUploadPackId
        stickerUploadPackId = null
        if (uri != null && packId != null) {
            pendingEdit = PendingImageEdit(packId, uri, ImageEditTarget.Sticker)
        }
    }
    val trayIconPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val packId = trayIconPackId
        trayIconPackId = null
        if (uri != null && packId != null) {
            pendingEdit = PendingImageEdit(packId, uri, ImageEditTarget.TrayIcon)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        LoginBox(
            onLogin = { email, password -> viewModel.login(email, password) },
            onSync = { viewModel.sync() },
            onSettings = {
                viewModel.refreshCacheUsage()
                showSettings = true
            },
            status = status,
        )

        if (packs.isEmpty()) {
            Text("No packs synced yet", style = MaterialTheme.typography.bodyMedium)
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(packs, key = { it.id }) { pack ->
                    PackRow(
                        pack = pack,
                        stickers = stickersByPack[pack.id].orEmpty(),
                        onAdd = { WhatsAppStickerLauncher.addPack(context, pack) },
                        onAddBusiness = { WhatsAppStickerLauncher.addPackToBusiness(context, pack) },
                        onResync = { viewModel.syncPack(pack.id) },
                        onClearLocal = { viewModel.clearPackCache(pack.id) },
                        onUploadSticker = {
                            stickerUploadPackId = pack.id
                            stickerPicker.launch("image/*")
                        },
                        onReplaceTrayIcon = {
                            trayIconPackId = pack.id
                            trayIconPicker.launch("image/*")
                        },
                    )
                }
            }
        }
    }

    if (showSettings) {
        SettingsDialog(
            serverUrl = serverUrl,
            account = account,
            cacheUsage = cacheUsage,
            onSaveServerUrl = { viewModel.saveServerUrl(it) },
            onLogout = { viewModel.logout() },
            onClearCache = { viewModel.clearCache() },
            onTroubleshooting = { showTroubleshooting = true },
            onDismiss = { showSettings = false },
        )
    }

    if (showTroubleshooting) {
        ImportTroubleshootingDialog(onDismiss = { showTroubleshooting = false })
    }

    pendingEdit?.let { edit ->
        ImageEditDialog(
            edit = edit,
            onDismiss = { pendingEdit = null },
            onSubmit = { options ->
                when (edit.target) {
                    ImageEditTarget.Sticker -> viewModel.uploadSticker(edit.packId, edit.uri, options)
                    ImageEditTarget.TrayIcon -> viewModel.replaceTrayIcon(edit.packId, edit.uri, options)
                }
                pendingEdit = null
            },
        )
    }
}

@Composable
private fun LoginBox(
    onLogin: (String, String) -> Unit,
    onSync: () -> Unit,
    onSettings: () -> Unit,
    status: AppStatus,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { onLogin(email, password) }) {
                Text("Login")
            }
            Button(onClick = onSync) {
                Text("Sync")
            }
            Button(onClick = onSettings) {
                Text("Settings")
            }
        }
        if (status.message.isNotBlank()) {
            Text(
                status.message,
                color = if (status.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun SettingsDialog(
    serverUrl: String,
    account: String,
    cacheUsage: String,
    onSaveServerUrl: (String) -> Unit,
    onLogout: () -> Unit,
    onClearCache: () -> Unit,
    onTroubleshooting: () -> Unit,
    onDismiss: () -> Unit,
) {
    var editedServerUrl by remember(serverUrl) { mutableStateOf(serverUrl) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Settings") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = editedServerUrl,
                    onValueChange = { editedServerUrl = it },
                    label = { Text("Server URL") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("Account: $account", style = MaterialTheme.typography.bodySmall)
                Text("Cache usage: $cacheUsage", style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = onLogout) {
                        Text("Logout")
                    }
                    TextButton(onClick = onClearCache) {
                        Text("Clear cache")
                    }
                }
                TextButton(onClick = onTroubleshooting) {
                    Text("Import troubleshooting")
                }
            }
        },
        confirmButton = {
            Button(onClick = { onSaveServerUrl(editedServerUrl) }) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Close")
            }
        },
    )
}

@Composable
private fun ImportTroubleshootingDialog(onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Import troubleshooting") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Check the pack has 3-30 stickers and a tray icon.", style = MaterialTheme.typography.bodySmall)
                Text("Tap Resync, then try WhatsApp import again.", style = MaterialTheme.typography.bodySmall)
                Text("If the pack was already added, change stickers or tray icon so image_data_version increments.", style = MaterialTheme.typography.bodySmall)
                Text("For provider errors, check adb logcat and the contentProviderAuthority build setting.", style = MaterialTheme.typography.bodySmall)
                Text("Test WhatsApp and WhatsApp Business separately; each app keeps its own imported pack state.", style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            Button(onClick = onDismiss) {
                Text("Done")
            }
        },
    )
}

@Composable
private fun PackRow(
    pack: PackEntity,
    stickers: List<StickerEntity>,
    onAdd: () -> Unit,
    onAddBusiness: () -> Unit,
    onResync: () -> Unit,
    onClearLocal: () -> Unit,
    onUploadSticker: () -> Unit,
    onReplaceTrayIcon: () -> Unit,
) {
    val cacheReady = pack.extractionStatus == EXTRACTION_READY
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(pack.name, style = MaterialTheme.typography.titleMedium)
            Text(pack.publisher, style = MaterialTheme.typography.bodyMedium)
            pack.teamName?.let { teamName ->
                Text("Team: $teamName", style = MaterialTheme.typography.bodySmall)
            }
            Text(
                "${pack.stickerCount} stickers · Version ${pack.imageDataVersion}",
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                "${roleLabel(pack)} · ${if (pack.canEdit) "Editable" else "Read-only"}",
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                collaboratorDetails(pack),
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                "${if (pack.isPublic) "Public pack" else "Private pack"} · Updated ${pack.updatedAt.take(10)}",
                style = MaterialTheme.typography.bodySmall,
            )
            if (!cacheReady) {
                Text(
                    extractionStatusLabel(pack),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (pack.extractionStatus == EXTRACTION_FAILED) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onAdd,
                    enabled = pack.stickerCount >= 3 && cacheReady,
                ) {
                    Text("WhatsApp")
                }
                Button(
                    onClick = onAddBusiness,
                    enabled = pack.stickerCount >= 3 && cacheReady,
                ) {
                    Text("Business")
                }
                Button(onClick = onResync) {
                    Text("Resync")
                }
                TextButton(onClick = onClearLocal) {
                    Text("Clear local")
                }
            }
            if (pack.stickerCount < 3) {
                Text("Needs at least 3 stickers before WhatsApp import", style = MaterialTheme.typography.bodySmall)
            }
            StickerPreviewRow(pack = pack, stickers = stickers)
            if (pack.canEdit) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = onUploadSticker) {
                        Text("Upload sticker")
                    }
                    Button(onClick = onReplaceTrayIcon) {
                        Text("Replace tray")
                    }
                }
            }
        }
    }
}

@Composable
private fun StickerPreviewRow(pack: PackEntity, stickers: List<StickerEntity>) {
    if (stickers.isEmpty()) return

    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(stickers.take(12), key = { it.fileName }) { sticker ->
            val path = remember(pack.localPath, sticker.fileName) {
                File(pack.localPath, sticker.fileName).absolutePath
            }
            val preview = remember(path) { loadImageBitmap(path) }
            if (preview != null) {
                Image(
                    bitmap = preview,
                    contentDescription = sticker.accessibilityText,
                    modifier = Modifier.size(64.dp),
                    contentScale = ContentScale.Fit,
                )
            }
        }
        if (stickers.size > 12) {
            item {
                Text("+${stickers.size - 12}", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

private fun roleLabel(pack: PackEntity): String = when (pack.role) {
    "OWNER" -> "Owner"
    "EDITOR" -> "Editor"
    "VIEWER" -> "Viewer"
    else -> if (pack.isOwner) "Owner" else "Viewer"
}

private fun collaboratorDetails(pack: PackEntity): String = when {
    pack.canManage -> "Can manage members, invites, pack details, and stickers"
    pack.canEdit -> "Can upload stickers, replace tray icons, and edit sticker images"
    else -> "Can sync, preview, export, and import into WhatsApp"
}

private fun extractionStatusLabel(pack: PackEntity): String = when (pack.extractionStatus) {
    EXTRACTION_SYNCING -> "Local cache is syncing"
    EXTRACTION_FAILED -> "Local cache failed${pack.extractionError?.let { ": $it" } ?: ""}"
    else -> "Local cache is not ready"
}

@Composable
private fun ImageEditDialog(
    edit: PendingImageEdit,
    onDismiss: () -> Unit,
    onSubmit: (ImageEditOptions) -> Unit,
) {
    val context = LocalContext.current
    val previewSource = remember(edit.uri) { loadBitmap(context, edit.uri) }
    val sourceInfo = remember(edit.uri) { imageSourceInfo(context, edit.uri) }
    var rotation by remember(edit.uri) { mutableStateOf(0) }
    var cropSquare by remember(edit.uri) { mutableStateOf(false) }
    var zoom by remember(edit.uri) { mutableStateOf(1f) }
    var offsetX by remember(edit.uri) { mutableStateOf(0f) }
    var offsetY by remember(edit.uri) { mutableStateOf(0f) }
    var brightness by remember(edit.uri) { mutableStateOf(0f) }
    var contrast by remember(edit.uri) { mutableStateOf(0f) }
    var saturation by remember(edit.uri) { mutableStateOf(0f) }
    var grayscale by remember(edit.uri) { mutableStateOf(false) }
    var textEnabled by remember(edit.uri) { mutableStateOf(false) }
    var textContent by remember(edit.uri) { mutableStateOf("") }
    var textSize by remember(edit.uri) { mutableStateOf(64f) }
    var brushEnabled by remember(edit.uri) { mutableStateOf(false) }
    var brushMode by remember(edit.uri) { mutableStateOf(BrushMode.Erase) }
    var brushSize by remember(edit.uri) { mutableStateOf(36f) }
    var brushStrokes by remember(edit.uri) { mutableStateOf(emptyList<BrushStroke>()) }
    var undoneBrushStrokes by remember(edit.uri) { mutableStateOf(emptyList<BrushStroke>()) }
    var activeBrushPoints by remember(edit.uri) { mutableStateOf(emptyList<BrushPoint>()) }
    val title = when (edit.target) {
        ImageEditTarget.Sticker -> "Edit sticker"
        ImageEditTarget.TrayIcon -> "Edit tray icon"
    }
    val previewBrushStrokes = if (activeBrushPoints.isEmpty()) {
        brushStrokes
    } else {
        brushStrokes + BrushStroke(brushMode, brushSize, activeBrushPoints)
    }
    val currentOptions = ImageEditOptions(
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
        brushStrokes = previewBrushStrokes,
    )
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
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (preview != null) {
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
                                .pointerInput(brushEnabled, brushMode, brushSize, preview.width, preview.height) {
                                    if (!brushEnabled) return@pointerInput
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
                                        onDragStart = { offset ->
                                            activeBrushPoints = listOf(normalized(offset))
                                        },
                                        onDrag = { change, _ ->
                                            activeBrushPoints = activeBrushPoints + normalized(change.position)
                                            change.consume()
                                        },
                                        onDragEnd = {
                                            if (activeBrushPoints.isNotEmpty()) {
                                                brushStrokes = brushStrokes + BrushStroke(
                                                    brushMode,
                                                    brushSize,
                                                    activeBrushPoints,
                                                )
                                                undoneBrushStrokes = emptyList()
                                                activeBrushPoints = emptyList()
                                            }
                                        },
                                        onDragCancel = { activeBrushPoints = emptyList() },
                                    )
                                },
                        ) {
                            if (brushEnabled) {
                                drawRect(Color.Transparent)
                            }
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { rotation = (rotation + 270) % 360 }) {
                        Text("Rotate left")
                    }
                    TextButton(onClick = { rotation = (rotation + 90) % 360 }) {
                        Text("Rotate right")
                    }
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Checkbox(
                        checked = cropSquare,
                        onCheckedChange = {
                            cropSquare = it
                            if (!it) {
                                zoom = 1f
                                offsetX = 0f
                                offsetY = 0f
                            }
                        },
                    )
                    Text("Square crop")
                }
                if (cropSquare) {
                    Text("Zoom", style = MaterialTheme.typography.bodySmall)
                    Slider(value = zoom, onValueChange = { zoom = it }, valueRange = 1f..3f)
                    Text("Horizontal", style = MaterialTheme.typography.bodySmall)
                    Slider(value = offsetX, onValueChange = { offsetX = it }, valueRange = -100f..100f)
                    Text("Vertical", style = MaterialTheme.typography.bodySmall)
                    Slider(value = offsetY, onValueChange = { offsetY = it }, valueRange = -100f..100f)
                }
                Text("Brightness", style = MaterialTheme.typography.bodySmall)
                Slider(value = brightness, onValueChange = { brightness = it }, valueRange = -100f..100f)
                Text("Contrast", style = MaterialTheme.typography.bodySmall)
                Slider(value = contrast, onValueChange = { contrast = it }, valueRange = -100f..100f)
                Text("Saturation", style = MaterialTheme.typography.bodySmall)
                Slider(value = saturation, onValueChange = { saturation = it }, valueRange = -100f..100f)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Checkbox(checked = grayscale, onCheckedChange = { grayscale = it })
                    Text("Grayscale")
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Checkbox(
                        checked = textEnabled,
                        onCheckedChange = {
                            textEnabled = it
                            if (!it) textContent = ""
                        },
                    )
                    Text("Text")
                }
                if (textEnabled) {
                    OutlinedTextField(
                        value = textContent,
                        onValueChange = { textContent = it.take(80) },
                        label = { Text("Sticker text") },
                        singleLine = true,
                    )
                    Text("Text size", style = MaterialTheme.typography.bodySmall)
                    Slider(value = textSize, onValueChange = { textSize = it }, valueRange = 18f..140f)
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Checkbox(
                        checked = brushEnabled,
                        onCheckedChange = {
                            brushEnabled = it
                            activeBrushPoints = emptyList()
                        },
                    )
                    Text("Brush")
                }
                if (brushEnabled) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextButton(onClick = { brushMode = BrushMode.Erase }) {
                            Text(if (brushMode == BrushMode.Erase) "Erase *" else "Erase")
                        }
                        TextButton(onClick = { brushMode = BrushMode.Restore }) {
                            Text(if (brushMode == BrushMode.Restore) "Restore *" else "Restore")
                        }
                    }
                    Text("Brush size", style = MaterialTheme.typography.bodySmall)
                    Slider(value = brushSize, onValueChange = { brushSize = it }, valueRange = 8f..96f)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextButton(
                            enabled = brushStrokes.isNotEmpty(),
                            onClick = {
                                val last = brushStrokes.lastOrNull() ?: return@TextButton
                                brushStrokes = brushStrokes.dropLast(1)
                                undoneBrushStrokes = undoneBrushStrokes + last
                            },
                        ) {
                            Text("Undo")
                        }
                        TextButton(
                            enabled = undoneBrushStrokes.isNotEmpty(),
                            onClick = {
                                val last = undoneBrushStrokes.lastOrNull() ?: return@TextButton
                                undoneBrushStrokes = undoneBrushStrokes.dropLast(1)
                                brushStrokes = brushStrokes + last
                            },
                        ) {
                            Text("Redo")
                        }
                    }
                }
                Text(
                    text = estimatedBytes?.let { "Estimated upload: ~${formatBytes(it)}" } ?: "Estimated upload: unavailable",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
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

private enum class ImageEditTarget {
    Sticker,
    TrayIcon,
}

private data class PendingImageEdit(
    val packId: String,
    val uri: Uri,
    val target: ImageEditTarget,
)

private data class ImageSourceInfo(
    val width: Int,
    val height: Int,
    val bytes: Long,
)

private fun loadBitmap(context: Context, uri: Uri): Bitmap? =
    context.contentResolver.openInputStream(uri)?.use { input ->
        BitmapFactory.decodeStream(input)
    }

private fun loadImageBitmap(path: String): ImageBitmap? =
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
    val estimated = maxOf(source.bytes * pixelRatio * 1.25, outputPixels * 0.16)
    return estimated.toLong().coerceAtLeast(1L)
}

private fun formatBytes(bytes: Long): String =
    if (bytes < 1024) {
        "$bytes B"
    } else {
        "${(bytes + 1023) / 1024} KB"
    }
