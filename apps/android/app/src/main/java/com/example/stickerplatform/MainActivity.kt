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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import com.example.stickerplatform.whatsapp.WhatsAppStickerLauncher

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
    val status by viewModel.status.collectAsState()
    val context = LocalContext.current
    var stickerUploadPackId by remember { mutableStateOf<String?>(null) }
    var trayIconPackId by remember { mutableStateOf<String?>(null) }
    var pendingEdit by remember { mutableStateOf<PendingImageEdit?>(null) }
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
            status = status,
        )

        if (packs.isEmpty()) {
            Text("No packs synced yet", style = MaterialTheme.typography.bodyMedium)
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(packs, key = { it.id }) { pack ->
                    PackRow(
                        pack = pack,
                        onAdd = { WhatsAppStickerLauncher.addPack(context, pack) },
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
        }
        if (status.isNotBlank()) {
            Text(status, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun PackRow(
    pack: PackEntity,
    onAdd: () -> Unit,
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
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onAdd,
                    enabled = pack.stickerCount >= 3,
                ) {
                    Text("Add to WhatsApp")
                }
            }
            if (pack.stickerCount < 3) {
                Text("Needs at least 3 stickers before WhatsApp import", style = MaterialTheme.typography.bodySmall)
            }
            if (pack.isOwner) {
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
private fun ImageEditDialog(
    edit: PendingImageEdit,
    onDismiss: () -> Unit,
    onSubmit: (ImageEditOptions) -> Unit,
) {
    val context = LocalContext.current
    val preview = remember(edit.uri) { loadImageBitmap(context, edit.uri) }
    var rotation by remember(edit.uri) { mutableStateOf(0) }
    var cropSquare by remember(edit.uri) { mutableStateOf(false) }
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
                            .graphicsLayer(rotationZ = rotation.toFloat()),
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
                    Checkbox(checked = cropSquare, onCheckedChange = { cropSquare = it })
                    Text("Square crop")
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSubmit(ImageEditOptions(rotationDegrees = rotation, cropSquare = cropSquare))
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
