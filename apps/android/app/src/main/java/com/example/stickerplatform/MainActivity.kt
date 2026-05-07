package com.example.stickerplatform

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.stickerplatform.data.ImageEditOptions
import com.example.stickerplatform.data.PackEntity
import com.example.stickerplatform.data.StickerEntity
import com.example.stickerplatform.whatsapp.WhatsAppStickerLauncher
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
    val cacheUsage by viewModel.cacheUsage.collectAsState()
    val context = LocalContext.current
    var stickerUploadPackId by remember { mutableStateOf<String?>(null) }
    var trayIconPackId by remember { mutableStateOf<String?>(null) }
    var pendingEdit by remember { mutableStateOf<PendingImageEdit?>(null) }
    var showSettings by remember { mutableStateOf(false) }
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
            cacheUsage = cacheUsage,
            onSaveServerUrl = { viewModel.saveServerUrl(it) },
            onLogout = { viewModel.logout() },
            onClearCache = { viewModel.clearCache() },
            onDismiss = { showSettings = false },
        )
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
    status: String,
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
        if (status.isNotBlank()) {
            Text(status, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun SettingsDialog(
    serverUrl: String,
    cacheUsage: String,
    onSaveServerUrl: (String) -> Unit,
    onLogout: () -> Unit,
    onClearCache: () -> Unit,
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
                Text("Cache usage: $cacheUsage", style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = onLogout) {
                        Text("Logout")
                    }
                    TextButton(onClick = onClearCache) {
                        Text("Clear cache")
                    }
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
private fun PackRow(
    pack: PackEntity,
    stickers: List<StickerEntity>,
    onAdd: () -> Unit,
    onAddBusiness: () -> Unit,
    onUploadSticker: () -> Unit,
    onReplaceTrayIcon: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(pack.name, style = MaterialTheme.typography.titleMedium)
            Text(pack.publisher, style = MaterialTheme.typography.bodyMedium)
            Text(
                "${pack.stickerCount} stickers · Version ${pack.imageDataVersion}",
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                "${roleLabel(pack)} · ${if (pack.canEdit) "Editable" else "Read-only"}",
                style = MaterialTheme.typography.bodySmall,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onAdd,
                    enabled = pack.stickerCount >= 3,
                ) {
                    Text("WhatsApp")
                }
                Button(
                    onClick = onAddBusiness,
                    enabled = pack.stickerCount >= 3,
                ) {
                    Text("Business")
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

@Composable
private fun ImageEditDialog(
    edit: PendingImageEdit,
    onDismiss: () -> Unit,
    onSubmit: (ImageEditOptions) -> Unit,
) {
    val context = LocalContext.current
    val preview = remember(edit.uri) { loadImageBitmap(context, edit.uri) }
    var rotation by remember(edit.uri) { mutableStateOf(0) }
    var cropSquare by remember(edit.uri) { mutableStateOf(false) }
    var zoom by remember(edit.uri) { mutableStateOf(1f) }
    var offsetX by remember(edit.uri) { mutableStateOf(0f) }
    var offsetY by remember(edit.uri) { mutableStateOf(0f) }
    val title = when (edit.target) {
        ImageEditTarget.Sticker -> "Edit sticker"
        ImageEditTarget.TrayIcon -> "Edit tray icon"
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (preview != null) {
                    Image(
                        bitmap = preview,
                        contentDescription = null,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(220.dp)
                            .clipToBounds()
                            .graphicsLayer(
                                rotationZ = rotation.toFloat(),
                                scaleX = if (cropSquare) zoom else 1f,
                                scaleY = if (cropSquare) zoom else 1f,
                                translationX = if (cropSquare) offsetX else 0f,
                                translationY = if (cropSquare) offsetY else 0f,
                            ),
                        contentScale = if (cropSquare) ContentScale.Crop else ContentScale.Fit,
                    )
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
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSubmit(
                        ImageEditOptions(
                            rotationDegrees = rotation,
                            cropSquare = cropSquare,
                            zoom = zoom,
                            offsetX = offsetX,
                            offsetY = offsetY,
                        ),
                    )
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

private fun loadImageBitmap(context: Context, uri: Uri): ImageBitmap? =
    context.contentResolver.openInputStream(uri)?.use { input ->
        BitmapFactory.decodeStream(input)?.asImageBitmap()
    }

private fun loadImageBitmap(path: String): ImageBitmap? =
    BitmapFactory.decodeFile(path)?.asImageBitmap()
