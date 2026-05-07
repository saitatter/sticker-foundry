package com.stickerfoundry.app

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import com.stickerfoundry.app.data.EXTRACTION_FAILED
import com.stickerfoundry.app.data.EXTRACTION_READY
import com.stickerfoundry.app.data.EXTRACTION_SYNCING
import com.stickerfoundry.app.data.PackEntity
import com.stickerfoundry.app.data.StickerEntity
import java.io.File

@Composable
fun PackRow(
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

