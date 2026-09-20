package com.stickerfoundry.app.packs

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.stickerfoundry.app.AppStatus
import com.stickerfoundry.app.StatusMessage
import com.stickerfoundry.app.loadImageBitmap
import com.stickerfoundry.app.data.AuditLogEntryDto
import com.stickerfoundry.app.data.PackDetailDto
import com.stickerfoundry.app.data.PackEntity
import com.stickerfoundry.app.data.PackInviteDto
import com.stickerfoundry.app.data.PackMemberDto
import com.stickerfoundry.app.data.PackDto
import com.stickerfoundry.app.data.JobDto
import com.stickerfoundry.app.data.StickerCommentDto
import com.stickerfoundry.app.data.StickerDto
import com.stickerfoundry.app.data.UpdatePackRequest
import com.stickerfoundry.app.data.UserDto
import java.io.File
import java.text.DateFormat
import java.util.Date

private enum class PackTab(val title: String) {
    OVERVIEW("Overview"),
    STICKERS("Stickers"),
    ACTIVITY("Activity"),
    COLLABORATION("Collaboration"),
    SETTINGS("Settings"),
}

@Composable
fun PackWorkspaceScreen(
    pack: PackDetailDto,
    localPack: PackEntity?,
    status: AppStatus,
    currentUser: UserDto?,
    remotePacks: List<PackDto>,
    members: List<PackMemberDto>,
    invites: List<PackInviteDto>,
    activity: List<AuditLogEntryDto>,
    comments: List<StickerCommentDto>,
    onBack: () -> Unit,
    onSync: () -> Unit,
    onExport: () -> Unit,
    onSharePublic: () -> Unit,
    jobs: List<JobDto>,
    onCancelJob: (String) -> Unit,
    onRetryJob: (String) -> Unit,
    onWhatsApp: () -> Unit,
    onWhatsAppBusiness: () -> Unit,
    onUpload: () -> Unit,
    onUploadBatch: () -> Unit,
    onReplaceTrayIcon: () -> Unit,
    onUpdatePack: (UpdatePackRequest) -> Unit,
    onClone: () -> Unit,
    onDelete: () -> Unit,
    onUpdateSticker: (String, List<String>, String, String) -> Unit,
    onDeleteSticker: (String) -> Unit,
    onReplaceStickerImage: (String) -> Unit,
    onReorder: (List<String>) -> Unit,
    onCopy: (String, List<String>) -> Unit,
    onMove: (String, List<String>) -> Unit,
    onLoadComments: (String) -> Unit,
    onCreateComment: (String, String) -> Unit,
    onDeleteComment: (String) -> Unit,
    onLoadActivity: () -> Unit,
    onInvite: (String, String, String?) -> Unit,
    onRevokeInvite: (String) -> Unit,
    onUpdateMember: (String, String) -> Unit,
    onRemoveMember: (String) -> Unit,
) {
    var selectedTab by rememberSaveable(pack.id) { mutableStateOf(PackTab.OVERVIEW) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
    var showCloneConfirm by remember { mutableStateOf(false) }
    var selectedSticker by remember { mutableStateOf<StickerDto?>(null) }
    var selectedStickerIds by remember { mutableStateOf(emptySet<String>()) }
    val visibleTabs = remember(pack.canManage) {
        PackTab.values().filter { it != PackTab.COLLABORATION || pack.canManage == true }
    }

    LaunchedEffect(selectedTab, pack.id) {
        if (selectedTab == PackTab.ACTIVITY) onLoadActivity()
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            IconButton(onClick = onBack) { Icon(Icons.Outlined.ArrowBack, contentDescription = "Back to packs") }
            Column(modifier = Modifier.weight(1f)) {
                Text(pack.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                Text(pack.publisher, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = onSync) { Icon(Icons.Outlined.Sync, contentDescription = "Sync pack") }
            PackOverflowMenu(
                canManage = pack.canManage == true,
                onClone = { showCloneConfirm = true },
                onDelete = { showDeleteConfirm = true },
            )
        }
        ScrollableTabRow(selectedTabIndex = visibleTabs.indexOf(selectedTab).coerceAtLeast(0), edgePadding = 0.dp) {
            visibleTabs.forEach { tab ->
                Tab(
                    selected = selectedTab == tab,
                    onClick = { selectedTab = tab },
                    text = { Text(if (tab == PackTab.STICKERS) "${tab.title} (${pack.stickerCount})" else tab.title) },
                )
            }
        }
        StatusMessage(status)
        Spacer(modifier = Modifier.height(8.dp))
        when (selectedTab) {
            PackTab.OVERVIEW -> OverviewTab(
                pack = pack,
                localPack = localPack,
                onExport = onExport,
                onSharePublic = onSharePublic,
                jobs = jobs,
                onCancelJob = onCancelJob,
                onRetryJob = onRetryJob,
                onWhatsApp = onWhatsApp,
                onWhatsAppBusiness = onWhatsAppBusiness,
                onUpload = onUpload,
                onUploadBatch = onUploadBatch,
                onReplaceTrayIcon = onReplaceTrayIcon,
            )
            PackTab.STICKERS -> StickersTab(
                pack = pack,
                localPack = localPack,
                remotePacks = remotePacks,
                selectedStickerIds = selectedStickerIds,
                onSelectedStickerIdsChange = { selectedStickerIds = it },
                onUpload = onUpload,
                onUploadBatch = onUploadBatch,
                onUpdateSticker = onUpdateSticker,
                onDeleteSticker = onDeleteSticker,
                onReplaceStickerImage = onReplaceStickerImage,
                onReorder = onReorder,
                onCopy = onCopy,
                onMove = onMove,
                onOpenSticker = { selectedSticker = it; onLoadComments(it.id) },
            )
            PackTab.ACTIVITY -> ActivityTab(activity = activity)
            PackTab.COLLABORATION -> CollaborationTab(
                members = members,
                invites = invites,
                onInvite = onInvite,
                onRevokeInvite = onRevokeInvite,
                onUpdateMember = onUpdateMember,
                onRemoveMember = onRemoveMember,
            )
            PackTab.SETTINGS -> PackSettingsTab(
                pack = pack,
                onUpdatePack = onUpdatePack,
                onClone = { showCloneConfirm = true },
                onDelete = { showDeleteConfirm = true },
            )
        }
    }

    selectedSticker?.let { sticker ->
        StickerDetailsDialog(
            packId = pack.id,
            sticker = sticker,
            comments = comments,
            canEdit = pack.canEdit == true,
            currentUserId = currentUser?.id,
            onDismiss = { selectedSticker = null },
            onSave = { emojis, altText, review ->
                onUpdateSticker(sticker.id, emojis, altText, review)
                selectedSticker = sticker.copy(emojis = emojis, accessibilityText = altText, reviewStatus = review)
            },
            onDelete = { onDeleteSticker(sticker.id); selectedSticker = null },
            onReplaceImage = { onReplaceStickerImage(sticker.id); selectedSticker = null },
            onCreateComment = { body -> onCreateComment(sticker.id, body) },
            onDeleteComment = { commentId -> onDeleteComment(commentId) },
        )
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Delete pack?") },
            text = { Text("This removes the pack and its stickers from the server.") },
            confirmButton = {
                Button(onClick = { showDeleteConfirm = false; onDelete() }) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancel") } },
        )
    }
    if (showCloneConfirm) {
        AlertDialog(
            onDismissRequest = { showCloneConfirm = false },
            title = { Text("Clone pack?") },
            text = { Text("A new copy of this pack will be created in your library.") },
            confirmButton = {
                Button(onClick = { showCloneConfirm = false; onClone() }) { Text("Clone") }
            },
            dismissButton = { TextButton(onClick = { showCloneConfirm = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun PackOverflowMenu(canManage: Boolean, onClone: () -> Unit, onDelete: () -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { expanded = true }) { Icon(Icons.Outlined.MoreVert, contentDescription = "Pack actions") }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text("Clone pack") },
                leadingIcon = { Icon(Icons.Outlined.ContentCopy, contentDescription = null) },
                onClick = { expanded = false; onClone() },
            )
            if (canManage) {
                DropdownMenuItem(
                    text = { Text("Delete pack") },
                    leadingIcon = { Icon(Icons.Outlined.Delete, contentDescription = null) },
                    onClick = { expanded = false; onDelete() },
                )
            }
        }
    }
}

@Composable
private fun OverviewTab(
    pack: PackDetailDto,
    localPack: PackEntity?,
    onExport: () -> Unit,
    onSharePublic: () -> Unit,
    jobs: List<JobDto>,
    onCancelJob: (String) -> Unit,
    onRetryJob: (String) -> Unit,
    onWhatsApp: () -> Unit,
    onWhatsAppBusiness: () -> Unit,
    onUpload: () -> Unit,
    onUploadBatch: () -> Unit,
    onReplaceTrayIcon: () -> Unit,
) {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxSize()) {
        if (jobs.isNotEmpty()) {
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Processing", style = MaterialTheme.typography.titleMedium)
                        jobs.takeLast(5).forEach { job ->
                            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(job.status.lowercase().replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.bodySmall)
                                    Text("${job.progress}%", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                if (job.status == "QUEUED" || job.status == "RUNNING" || job.status == "PENDING") {
                                    TextButton(onClick = { onCancelJob(job.id) }) { Text("Cancel") }
                                } else if (job.status == "FAILED" || job.status == "CANCELLED") {
                                    TextButton(onClick = { onRetryJob(job.id) }) { Text("Retry") }
                                }
                            }
                        }
                    }
                }
            }
        }
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(pack.name, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                    Text(pack.description?.ifBlank { "No description yet" } ?: "No description yet", style = MaterialTheme.typography.bodyMedium)
                    Text("Updated ${formatDate(pack.updatedAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SummaryPill("Stickers", "${pack.stickerCount}", Modifier.weight(1f))
                        SummaryPill("Export", if (pack.canExport == true) "Ready" else "Not ready", Modifier.weight(1f))
                        SummaryPill("Visibility", if (pack.isPublic) "Public" else "Private", Modifier.weight(1f))
                    }
                }
            }
        }
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Pack actions", style = MaterialTheme.typography.titleMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        Button(modifier = Modifier.weight(1f), onClick = onUpload) {
                            Icon(Icons.Outlined.Download, contentDescription = null)
                            Spacer(Modifier.width(6.dp))
                            Text("Upload")
                        }
                        OutlinedButton(modifier = Modifier.weight(1f), onClick = onReplaceTrayIcon) {
                            Text("Tray icon")
                        }
                    }
                    TextButton(onClick = onUploadBatch) { Text("Upload multiple stickers") }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        OutlinedButton(modifier = Modifier.weight(1f), onClick = onExport, enabled = pack.canExport == true) {
                            Icon(Icons.Outlined.Share, contentDescription = null)
                            Spacer(Modifier.width(6.dp))
                            Text("Export")
                        }
                        if (pack.isPublic) {
                            OutlinedButton(modifier = Modifier.weight(1f), onClick = onSharePublic) {
                                Icon(Icons.Outlined.Share, contentDescription = null)
                                Spacer(Modifier.width(6.dp))
                                Text("Share")
                            }
                        }
                    }
                }
            }
        }
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("WhatsApp", style = MaterialTheme.typography.titleMedium)
                    Text(
                        if (localPack != null) "This pack is cached locally and ready to import." else "Sync this pack when it has 3–30 stickers to import it.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        Button(modifier = Modifier.weight(1f), onClick = onWhatsApp, enabled = localPack != null) { Text("WhatsApp") }
                        OutlinedButton(modifier = Modifier.weight(1f), onClick = onWhatsAppBusiness, enabled = localPack != null) { Text("Business") }
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryPill(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun StickersTab(
    pack: PackDetailDto,
    localPack: PackEntity?,
    remotePacks: List<PackDto>,
    selectedStickerIds: Set<String>,
    onSelectedStickerIdsChange: (Set<String>) -> Unit,
    onUpload: () -> Unit,
    onUploadBatch: () -> Unit,
    onUpdateSticker: (String, List<String>, String, String) -> Unit,
    onDeleteSticker: (String) -> Unit,
    onReplaceStickerImage: (String) -> Unit,
    onReorder: (List<String>) -> Unit,
    onCopy: (String, List<String>) -> Unit,
    onMove: (String, List<String>) -> Unit,
    onOpenSticker: (StickerDto) -> Unit,
) {
    var showTransfer by remember { mutableStateOf(false) }
    var transferMode by remember { mutableStateOf("copy") }
    val sortedStickers = remember(pack.stickers) { pack.stickers.sortedBy { it.position } }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxSize()) {
        item {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Stickers", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                    Text("Select stickers to edit, move, review, or delete.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = onUploadBatch, enabled = pack.canEdit == true) { Text("Multiple") }
                    IconButton(onClick = onUpload, enabled = pack.canEdit == true) { Icon(Icons.Outlined.Download, contentDescription = "Upload stickers") }
                }
            }
        }
        if (selectedStickerIds.isNotEmpty()) {
            item {
                Card {
                    Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("${selectedStickerIds.size} selected", modifier = Modifier.weight(1f), fontWeight = FontWeight.Medium)
                        TextButton(onClick = { onDeleteSticker(selectedStickerIds.first()); onSelectedStickerIdsChange(emptySet()) }, enabled = selectedStickerIds.size == 1) { Text("Delete") }
                        TextButton(onClick = { transferMode = "copy"; showTransfer = true }) { Text("Copy") }
                        TextButton(onClick = { transferMode = "move"; showTransfer = true }) { Text("Move") }
                    }
                }
            }
        }
        items(sortedStickers, key = { it.id }) { sticker ->
            StickerMobileRow(
                sticker = sticker,
                selected = sticker.id in selectedStickerIds,
                canEdit = pack.canEdit == true,
                localPath = localPack?.localPath,
                localFileName = sticker.fileName,
                canMoveUp = sticker.position > 0,
                canMoveDown = sticker.position < sortedStickers.lastIndex,
                onSelected = { checked ->
                    onSelectedStickerIdsChange(if (checked) selectedStickerIds + sticker.id else selectedStickerIds - sticker.id)
                },
                onOpen = { onOpenSticker(sticker) },
                onMoveUp = {
                    val next = sortedStickers.toMutableList()
                    val index = sticker.position.coerceIn(0, next.lastIndex)
                    if (index > 0) {
                        val item = next.removeAt(index)
                        next.add(index - 1, item)
                        onReorder(next.map { it.id })
                    }
                },
                onMoveDown = {
                    val next = sortedStickers.toMutableList()
                    val index = sticker.position.coerceIn(0, next.lastIndex)
                    if (index < next.lastIndex) {
                        val item = next.removeAt(index)
                        next.add(index + 1, item)
                        onReorder(next.map { it.id })
                    }
                },
            )
        }
    }
    if (showTransfer) {
        TransferDialog(
            packs = remotePacks.filter { it.id != pack.id },
            mode = transferMode,
            onDismiss = { showTransfer = false },
            onConfirm = { targetId ->
                showTransfer = false
                if (transferMode == "copy") onCopy(targetId, selectedStickerIds.toList()) else onMove(targetId, selectedStickerIds.toList())
                onSelectedStickerIdsChange(emptySet())
            },
        )
    }
}

@Composable
private fun StickerMobileRow(
    sticker: StickerDto,
    selected: Boolean,
    canEdit: Boolean,
    localPath: String?,
    localFileName: String,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    onSelected: (Boolean) -> Unit,
    onOpen: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen)) {
        Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Checkbox(checked = selected, onCheckedChange = onSelected, enabled = canEdit)
            val preview = remember(localPath, localFileName, sticker.sha256) {
                localPath?.let { loadImageBitmap(File(it, localFileName).absolutePath) }
            }
            if (preview != null) {
                Image(bitmap = preview, contentDescription = sticker.accessibilityText, modifier = Modifier.size(58.dp), contentScale = ContentScale.Fit)
            } else {
                Box(modifier = Modifier.size(58.dp).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
                    Icon(Icons.Outlined.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                }
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(sticker.emojis.joinToString(" ").ifBlank { "No emoji" }, style = MaterialTheme.typography.titleSmall)
                Text(sticker.accessibilityText?.ifBlank { sticker.fileName } ?: sticker.fileName, style = MaterialTheme.typography.bodySmall, maxLines = 2)
                Text(sticker.reviewStatus, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            }
            Column {
                IconButton(onClick = onMoveUp, enabled = canEdit && canMoveUp) { Icon(Icons.Outlined.ArrowUpward, contentDescription = "Move up") }
                IconButton(onClick = onMoveDown, enabled = canEdit && canMoveDown) { Icon(Icons.Outlined.ArrowDownward, contentDescription = "Move down") }
            }
        }
    }
}

@Composable
private fun ActivityTab(activity: List<AuditLogEntryDto>) {
    var pageSize by rememberSaveable { mutableIntStateOf(10) }
    var page by rememberSaveable { mutableIntStateOf(1) }
    var selectedEntry by remember { mutableStateOf<AuditLogEntryDto?>(null) }
    val totalPages = maxOf(1, (activity.size + pageSize - 1) / pageSize)
    val currentPage = page.coerceIn(1, totalPages)
    val visible = activity.drop((currentPage - 1) * pageSize).take(pageSize)
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxSize()) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Activity", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                    Text("Tap an entry to inspect the before and after state.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                PageSizeMenu(pageSize = pageSize, onChange = { pageSize = it; page = 1 })
            }
        }
        if (visible.isEmpty()) item { EmptyPanel("No activity yet") }
        items(visible, key = { it.id }) { entry ->
            Card(modifier = Modifier.fillMaxWidth().clickable { selectedEntry = entry }) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(activityLabel(entry), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium)
                    Text(entry.actor?.displayName ?: entry.actor?.email ?: "System", style = MaterialTheme.typography.bodySmall)
                    Text(formatDate(entry.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        item {
            PageControls(page = currentPage, totalPages = totalPages, onPage = { page = it })
        }
    }
    selectedEntry?.let { entry ->
        AlertDialog(
            onDismissRequest = { selectedEntry = null },
            title = { Text(activityLabel(entry)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Before", style = MaterialTheme.typography.labelLarge)
                    Text(snapshotValue(entry.metadata, "before"), style = MaterialTheme.typography.bodySmall)
                    Text("After", style = MaterialTheme.typography.labelLarge)
                    Text(snapshotValue(entry.metadata, "after"), style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = { TextButton(onClick = { selectedEntry = null }) { Text("Close") } },
        )
    }
}

@Composable
private fun CollaborationTab(
    members: List<PackMemberDto>,
    invites: List<PackInviteDto>,
    onInvite: (String, String, String?) -> Unit,
    onRevokeInvite: (String) -> Unit,
    onUpdateMember: (String, String) -> Unit,
    onRemoveMember: (String) -> Unit,
) {
    var email by rememberSaveable { mutableStateOf("") }
    var role by rememberSaveable { mutableStateOf("EDITOR") }
    var expiresAt by rememberSaveable { mutableStateOf("") }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxSize()) {
        item {
            Text("Collaboration", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Text("Invite editors and viewers to work on this pack.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item {
            Card {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("New invite", style = MaterialTheme.typography.titleMedium)
                    OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("Email (optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    RolePicker(role = role, onRole = { role = it })
                    OutlinedTextField(value = expiresAt, onValueChange = { expiresAt = it }, label = { Text("Expires at (ISO date, optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Button(onClick = { onInvite(role, email, expiresAt.ifBlank { null }); email = "" }, enabled = role != "OWNER") {
                        Icon(Icons.Outlined.Send, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("Create invite")
                    }
                }
            }
        }
        item { Text("Members", style = MaterialTheme.typography.titleMedium) }
        items(members, key = { it.id }) { member ->
            MemberRow(member = member, onRole = { onUpdateMember(member.id, it) }, onRemove = { onRemoveMember(member.id) })
        }
        item { Text("Pending invites", style = MaterialTheme.typography.titleMedium) }
        if (invites.isEmpty()) item { EmptyPanel("No pending invites") }
        items(invites, key = { it.id }) { invite ->
            Card {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(invite.email ?: "Anyone with the invite code", style = MaterialTheme.typography.titleSmall)
                        Text("${invite.role} · ${invite.code}", style = MaterialTheme.typography.bodySmall)
                    }
                    IconButton(onClick = { onRevokeInvite(invite.id) }) { Icon(Icons.Outlined.Close, contentDescription = "Revoke invite") }
                }
            }
        }
    }
}

@Composable
private fun MemberRow(member: PackMemberDto, onRole: (String) -> Unit, onRemove: () -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Card {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Group, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(member.user.displayName, style = MaterialTheme.typography.titleSmall)
                Text(member.user.email, style = MaterialTheme.typography.bodySmall)
            }
            Box {
                TextButton(onClick = { expanded = true }) { Text(member.role) }
                DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    listOf("EDITOR", "VIEWER").forEach { nextRole ->
                        DropdownMenuItem(text = { Text(nextRole) }, onClick = { expanded = false; onRole(nextRole) })
                    }
                }
            }
            IconButton(onClick = onRemove) { Icon(Icons.Outlined.Delete, contentDescription = "Remove member") }
        }
    }
}

@Composable
private fun PackSettingsTab(
    pack: PackDetailDto,
    onUpdatePack: (UpdatePackRequest) -> Unit,
    onClone: () -> Unit,
    onDelete: () -> Unit,
) {
    var name by remember(pack.id, pack.name) { mutableStateOf(pack.name) }
    var publisher by remember(pack.id, pack.publisher) { mutableStateOf(pack.publisher) }
    var description by remember(pack.id, pack.description) { mutableStateOf(pack.description.orEmpty()) }
    var isPublic by remember(pack.id, pack.isPublic) { mutableStateOf(pack.isPublic) }
    var requiresApproval by remember(pack.id, pack.requiresApproval) { mutableStateOf(pack.requiresApproval) }
    var isAnimated by remember(pack.id, pack.isAnimated) { mutableStateOf(pack.isAnimated) }
    val dirty = name != pack.name || publisher != pack.publisher || description != pack.description.orEmpty() || isPublic != pack.isPublic || requiresApproval != pack.requiresApproval || isAnimated != pack.isAnimated
    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxSize()) {
        item {
            Text("Pack settings", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Text("Changes are saved together so you can review the result before leaving.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item {
            Card {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(publisher, { publisher = it }, label = { Text("Publisher") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(description, { description = it }, label = { Text("Description") }, minLines = 3, modifier = Modifier.fillMaxWidth())
                    SettingSwitch("Public pack", "Allow public sharing", isPublic) { isPublic = it }
                    SettingSwitch("Approval required", "Only approved stickers are exported", requiresApproval) { requiresApproval = it }
                    SettingSwitch("Animated pack", "Treat uploaded media as animated stickers", isAnimated) { isAnimated = it }
                    Button(
                        onClick = { onUpdatePack(UpdatePackRequest(name, publisher, description, isPublic, requiresApproval, isAnimated)) },
                        enabled = dirty && name.isNotBlank() && publisher.isNotBlank(),
                    ) { Text("Save changes") }
                }
            }
        }
        item {
            Card {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Danger zone", style = MaterialTheme.typography.titleMedium)
                    OutlinedButton(onClick = onClone) { Text("Clone pack") }
                    OutlinedButton(onClick = onDelete) { Text("Delete pack") }
                }
            }
        }
    }
}

@Composable
private fun SettingSwitch(title: String, subtitle: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun StickerDetailsDialog(
    packId: String,
    sticker: StickerDto,
    comments: List<StickerCommentDto>,
    canEdit: Boolean,
    currentUserId: String?,
    onDismiss: () -> Unit,
    onSave: (List<String>, String, String) -> Unit,
    onDelete: () -> Unit,
    onReplaceImage: () -> Unit,
    onCreateComment: (String) -> Unit,
    onDeleteComment: (String) -> Unit,
) {
    var emojis by remember(sticker.id, sticker.emojis) { mutableStateOf(sticker.emojis.joinToString(", ")) }
    var altText by remember(sticker.id, sticker.accessibilityText) { mutableStateOf(sticker.accessibilityText.orEmpty()) }
    var review by remember(sticker.id, sticker.reviewStatus) { mutableStateOf(sticker.reviewStatus) }
    var comment by remember { mutableStateOf("") }
    var showDelete by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false),
        title = { Text("Sticker details") },
        text = {
            Column(modifier = Modifier.fillMaxWidth().height(520.dp).verticalScroll(androidx.compose.foundation.rememberScrollState()), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                Text(sticker.fileName, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(emojis, { emojis = it }, label = { Text("Emojis") }, enabled = canEdit, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(altText, { altText = it }, label = { Text("Accessibility text") }, enabled = canEdit, minLines = 2, modifier = Modifier.fillMaxWidth())
                RolePicker(role = review, roles = listOf("PENDING", "APPROVED", "NEEDS_WORK"), onRole = { review = it }, enabled = canEdit)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onReplaceImage, enabled = canEdit) { Icon(Icons.Outlined.Edit, contentDescription = null); Spacer(Modifier.width(5.dp)); Text("Replace image") }
                    OutlinedButton(onClick = { showDelete = true }, enabled = canEdit) { Icon(Icons.Outlined.Delete, contentDescription = null); Spacer(Modifier.width(5.dp)); Text("Delete") }
                }
                HorizontalDivider()
                Text("Comments", style = MaterialTheme.typography.titleMedium)
                if (comments.isEmpty()) Text("No comments yet", style = MaterialTheme.typography.bodySmall)
                comments.forEach { item ->
                    Card {
                        Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.Top) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(item.user.displayName, style = MaterialTheme.typography.labelLarge)
                                Text(item.body, style = MaterialTheme.typography.bodySmall)
                            }
                            if (item.userId == currentUserId) IconButton(onClick = { onDeleteComment(item.id) }) { Icon(Icons.Outlined.Delete, contentDescription = "Delete comment") }
                        }
                    }
                }
                OutlinedTextField(comment, { comment = it }, label = { Text("Add comment") }, minLines = 2, modifier = Modifier.fillMaxWidth())
                Button(onClick = { onCreateComment(comment); comment = "" }, enabled = comment.isNotBlank()) {
                    Icon(Icons.Outlined.ChatBubbleOutline, contentDescription = null)
                    Spacer(Modifier.width(5.dp))
                    Text("Comment")
                }
            }
        },
        confirmButton = {
            Button(onClick = { onSave(emojis.split(',').map { it.trim() }.filter { it.isNotBlank() }.take(3), altText, review); onDismiss() }, enabled = canEdit) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
    if (showDelete) {
        AlertDialog(
            onDismissRequest = { showDelete = false },
            title = { Text("Delete sticker?") },
            text = { Text("This action cannot be undone.") },
            confirmButton = { Button(onClick = { showDelete = false; onDelete() }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { showDelete = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun TransferDialog(
    packs: List<PackDto>,
    mode: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var selectedId by remember { mutableStateOf(packs.firstOrNull()?.id.orEmpty()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (mode == "copy") "Copy stickers" else "Move stickers") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Choose a target pack.", style = MaterialTheme.typography.bodySmall)
                packs.forEach { pack ->
                    Row(modifier = Modifier.fillMaxWidth().clickable { selectedId = pack.id }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = selectedId == pack.id, onCheckedChange = { selectedId = pack.id })
                        Text(pack.name)
                    }
                }
                if (packs.isEmpty()) Text("No other packs available.", style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = { Button(onClick = { onConfirm(selectedId) }, enabled = selectedId.isNotBlank()) { Text(if (mode == "copy") "Copy" else "Move") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun RolePicker(
    role: String,
    roles: List<String> = listOf("EDITOR", "VIEWER"),
    onRole: (String) -> Unit,
    enabled: Boolean = true,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { expanded = true }, enabled = enabled) { Text("Role: $role") }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            roles.forEach { option -> DropdownMenuItem(text = { Text(option) }, onClick = { expanded = false; onRole(option) }) }
        }
    }
}

@Composable
private fun PageSizeMenu(pageSize: Int, onChange: (Int) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        TextButton(onClick = { expanded = true }) { Text("$pageSize / page") }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            listOf(10, 25, 100).forEach { size -> DropdownMenuItem(text = { Text("$size") }, onClick = { expanded = false; onChange(size) }) }
        }
    }
}

@Composable
private fun PageControls(page: Int, totalPages: Int, onPage: (Int) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = { onPage((page - 1).coerceAtLeast(1)) }, enabled = page > 1) { Text("Previous") }
        Text("$page / $totalPages", style = MaterialTheme.typography.labelLarge)
        TextButton(onClick = { onPage((page + 1).coerceAtMost(totalPages)) }, enabled = page < totalPages) { Text("Next") }
    }
}

@Composable
private fun EmptyPanel(message: String) {
    Card(modifier = Modifier.fillMaxWidth()) { Text(message, modifier = Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
}

private fun activityLabel(entry: AuditLogEntryDto): String = entry.action.replace('.', ' ').replace('-', ' ').replaceFirstChar { it.uppercase() }

private fun snapshotValue(metadata: Any?, key: String): String {
    val text = metadata?.toString().orEmpty()
    return if (text.contains(key, ignoreCase = true)) text else "No $key snapshot"
}

private fun formatDate(value: String): String = runCatching {
    DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date.from(java.time.Instant.parse(value)))
}.getOrDefault(value)

@Composable
fun PacksLibraryScreen(
    packs: List<PackDto>,
    publicPacks: List<PackDto> = emptyList(),
    localPacks: List<PackEntity>,
    status: AppStatus,
    loading: Boolean,
    onSync: () -> Unit,
    onOpenPack: (String) -> Unit,
    onCreatePack: (String, String, String, Boolean, Boolean, Boolean, String?) -> Unit,
    onLoadPublicPacks: () -> Unit = {},
    onSharePublicPack: (String) -> Unit = {},
) {
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf("ALL") }
    var sort by rememberSaveable { mutableStateOf("UPDATED") }
    var showCreate by remember { mutableStateOf(false) }
    var showPublic by remember { mutableStateOf(false) }
    val localById = remember(localPacks) { localPacks.associateBy { it.id } }
    val visiblePacks = remember(packs, query, filter, sort) {
        packs
            .filter { pack ->
                val matchesQuery = query.isBlank() || pack.name.contains(query, true) || pack.publisher.contains(query, true)
                val matchesFilter = when (filter) {
                    "PUBLIC" -> pack.isPublic
                    "PRIVATE" -> !pack.isPublic
                    "READY" -> pack.canExport == true
                    "NEEDS_WORK" -> pack.canExport != true
                    else -> true
                }
                matchesQuery && matchesFilter
            }
            .let { list ->
                when (sort) {
                    "NAME" -> list.sortedBy { it.name.lowercase() }
                    "STICKERS" -> list.sortedByDescending { it.stickerCount }
                    else -> list.sortedByDescending { it.updatedAt }
                }
            }
    }

    Column(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Packs", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                Text("Manage every pack on your server.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = onSync) { Icon(Icons.Outlined.Refresh, contentDescription = "Refresh packs") }
            Button(onClick = { showCreate = true }) { Text("New") }
        }
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text("Public discovery", style = MaterialTheme.typography.titleSmall)
                Text("Browse packs shared by this server.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            TextButton(onClick = { showPublic = !showPublic; if (!showPublic) onLoadPublicPacks() }) { Text(if (showPublic) "Hide public" else "Browse public") }
        }
        if (showPublic) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (publicPacks.isEmpty()) Text("No public packs yet.", style = MaterialTheme.typography.bodySmall)
                    publicPacks.forEach { pack ->
                        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(pack.name, style = MaterialTheme.typography.titleSmall)
                                Text("${pack.publisher} · ${pack.stickerCount} stickers", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            TextButton(onClick = { onSharePublicPack(pack.id) }) { Text("Share") }
                        }
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(query, { query = it }, label = { Text("Search packs") }, singleLine = true, modifier = Modifier.weight(1f))
            FilterMenu(label = filterLabel(filter), options = listOf("ALL", "PUBLIC", "PRIVATE", "READY", "NEEDS_WORK"), onSelected = { filter = it })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("${visiblePacks.size} packs", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            SortMenu(sort = sort, onSelected = { sort = it })
        }
        StatusMessage(status)
        if (loading && packs.isEmpty()) {
            EmptyPanel("Loading your packs…")
        } else if (visiblePacks.isEmpty()) {
            EmptyPanel(if (query.isBlank()) "No packs available" else "No packs match your search")
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
                items(visiblePacks, key = { it.id }) { pack ->
                    LibraryPackRow(pack = pack, localPack = localById[pack.id], onOpen = { onOpenPack(pack.id) })
                }
            }
        }
    }
    if (showCreate) {
        CreatePackDialog(
            onDismiss = { showCreate = false },
            onCreate = { name, publisher, description, isPublic, requiresApproval, isAnimated, teamId ->
                showCreate = false
                onCreatePack(name, publisher, description, isPublic, requiresApproval, isAnimated, teamId)
            },
        )
    }
}

@Composable
private fun LibraryPackRow(pack: PackDto, localPack: PackEntity?, onOpen: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen)) {
        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(modifier = Modifier.size(58.dp).clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                Text(pack.name.take(2).uppercase(), color = MaterialTheme.colorScheme.onPrimaryContainer, fontWeight = FontWeight.Bold)
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(pack.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
                Text(pack.publisher, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    "${pack.stickerCount} stickers · ${if (pack.isPublic) "Public" else "Private"} · ${if (pack.canExport == true) "Ready" else "Needs work"}",
                    style = MaterialTheme.typography.labelSmall,
                )
            }
            if (localPack != null) Icon(Icons.Outlined.CheckCircle, contentDescription = "Cached locally", tint = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun FilterMenu(label: String, options: List<String>, onSelected: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { expanded = true }) { Text(label) }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { option -> DropdownMenuItem(text = { Text(filterLabel(option)) }, onClick = { expanded = false; onSelected(option) }) }
        }
    }
}

@Composable
private fun SortMenu(sort: String, onSelected: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        TextButton(onClick = { expanded = true }) { Text("Sort: ${sortLabel(sort)}") }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            listOf("UPDATED", "NAME", "STICKERS").forEach { option -> DropdownMenuItem(text = { Text(sortLabel(option)) }, onClick = { expanded = false; onSelected(option) }) }
        }
    }
}

private fun filterLabel(value: String): String = when (value) {
    "PUBLIC" -> "Public"
    "PRIVATE" -> "Private"
    "READY" -> "Ready"
    "NEEDS_WORK" -> "Needs work"
    else -> "All"
}

private fun sortLabel(value: String): String = when (value) {
    "NAME" -> "Name"
    "STICKERS" -> "Stickers"
    else -> "Updated"
}

@Composable
private fun CreatePackDialog(
    onDismiss: () -> Unit,
    onCreate: (String, String, String, Boolean, Boolean, Boolean, String?) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var publisher by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var isPublic by remember { mutableStateOf(false) }
    var requiresApproval by remember { mutableStateOf(false) }
    var isAnimated by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false),
        title = { Text("New sticker pack") },
        text = {
            Column(modifier = Modifier.fillMaxWidth().verticalScroll(androidx.compose.foundation.rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(publisher, { publisher = it }, label = { Text("Publisher") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(description, { description = it }, label = { Text("Description") }, minLines = 2, modifier = Modifier.fillMaxWidth())
                SettingSwitch("Public pack", "Allow public sharing", isPublic) { isPublic = it }
                SettingSwitch("Approval required", "Only approved stickers are exported", requiresApproval) { requiresApproval = it }
                SettingSwitch("Animated pack", "Prepare animated sticker media", isAnimated) { isAnimated = it }
            }
        },
        confirmButton = { Button(onClick = { onCreate(name, publisher, description, isPublic, requiresApproval, isAnimated, null) }, enabled = name.isNotBlank() && publisher.isNotBlank()) { Text("Create") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
