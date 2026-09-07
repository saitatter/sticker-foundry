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
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape
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
    onExport: () -> Unit,
) {
    val cacheReady = pack.extractionStatus == EXTRACTION_READY
    val trayPreview = remember(pack.localPath, pack.trayImageFile) {
        loadImageBitmap(File(pack.localPath, pack.trayImageFile).absolutePath)
    }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                trayPreview?.let { preview ->
                    Image(
                        bitmap = preview,
                        contentDescription = "${pack.name} cover",
                        modifier = Modifier
                            .size(64.dp)
                            .clip(RoundedCornerShape(18.dp)),
                        contentScale = ContentScale.Crop,
                    )
                }
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(pack.name, style = MaterialTheme.typography.titleMedium)
                    Text(pack.publisher, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text(
                "${pack.stickerCount} stickers  ·  v${pack.imageDataVersion}  ·  ${if (pack.isPublic) "Public" else "Private"}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            pack.teamName?.let { teamName -> Text("Team: $teamName", style = MaterialTheme.typography.bodySmall) }
            Text("${roleLabel(pack)}  ·  ${if (pack.canEdit) "Editable" else "Read-only"}", style = MaterialTheme.typography.bodySmall)
            if (!cacheReady) {
                Text(
                    extractionStatusLabel(pack),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (pack.extractionStatus == EXTRACTION_FAILED) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                )
            }
            StickerPreviewRow(pack = pack, stickers = stickers)
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    modifier = Modifier.weight(1f),
                    onClick = onAdd,
                    enabled = pack.stickerCount >= 3 && cacheReady,
                ) {
                    Text("WhatsApp")
                }
                Button(
                    modifier = Modifier.weight(1f),
                    onClick = onAddBusiness,
                    enabled = pack.stickerCount >= 3 && cacheReady,
                ) {
                    Text("Business")
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    modifier = Modifier.weight(1f),
                    onClick = onResync,
                ) {
                    Text("Resync")
                }
                TextButton(
                    modifier = Modifier.weight(1f),
                    onClick = onClearLocal,
                ) {
                    Text("Clear local")
                }
                OutlinedButton(
                    modifier = Modifier.weight(1f),
                    onClick = onExport,
                    enabled = cacheReady,
                ) {
                    Text("Export & share")
                }
            }
            if (pack.stickerCount < 3) {
                Text("Add at least 3 stickers before importing into WhatsApp", style = MaterialTheme.typography.bodySmall)
            }
            if (pack.canEdit) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Text("Edit pack", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Button(
                        modifier = Modifier.weight(1f),
                        onClick = onUploadSticker,
                    ) {
                        Text("Upload sticker")
                    }
                    OutlinedButton(
                        modifier = Modifier.weight(1f),
                        onClick = onReplaceTrayIcon,
                    ) {
                        Text("Replace tray icon")
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

