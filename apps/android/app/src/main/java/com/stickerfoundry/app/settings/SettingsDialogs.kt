package com.stickerfoundry.app

import com.stickerfoundry.app.data.*

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Card
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog

enum class SettingsCategory(val title: String) {
    SERVER("Server"),
    APPEARANCE("Appearance"),
    ACCOUNT("Account"),
    SECURITY("Security"),
    TEAMS("Teams"),
    PROCESSING("Processing"),
    STORAGE("Storage"),
    AUDIT("Audit"),
    ADMIN("Admin"),
    HELP("Help"),
}

@Composable
fun SettingsWindow(
    initialCategory: SettingsCategory = SettingsCategory.SERVER,
    serverUrl: String,
    serverStatus: AppStatus,
    checkingServer: Boolean,
    account: String,
    cacheUsage: String,
    darkTheme: Boolean,
    onSaveServerUrl: (String) -> Unit,
    onCheckServerUrl: (String) -> Unit,
    onLogout: () -> Unit,
    onClearCache: () -> Unit,
    onToggleTheme: (Boolean) -> Unit,
    onTroubleshooting: () -> Unit,
    onDismiss: () -> Unit,
    isAdmin: Boolean = false,
    sessions: List<UserSessionDto> = emptyList(),
    onLoadSessions: () -> Unit = {},
    onChangePassword: (String, String) -> Unit = { _, _ -> },
    onRevokeSession: (String) -> Unit = {},
    onRevokeAllSessions: () -> Unit = {},
    teams: List<TeamDto> = emptyList(),
    onCreateTeam: (CreateTeamRequest) -> Unit = {},
    teamMembers: List<TeamMemberDto> = emptyList(),
    onLoadTeamMembers: (String) -> Unit = {},
    onAddTeamMember: (String, String, String) -> Unit = { _, _, _ -> },
    onUpdateTeamMember: (String, String, String) -> Unit = { _, _, _ -> },
    onRemoveTeamMember: (String, String) -> Unit = { _, _ -> },
    onAcceptInvite: (String) -> Unit = {},
    adminSettings: AdminSettingsDto? = null,
    adminAuditLog: List<AuditLogEntryDto> = emptyList(),
    onLoadAdminSettings: () -> Unit = {},
    onUpdateAdminSettings: (UpdateAdminSettingsRequest) -> Unit = {},
    onLoadAdminAuditLog: () -> Unit = {},
    onCleanupAuditLog: () -> Unit = {},
    onExportAuditLog: () -> Unit = {},
) {
    var selectedCategory by rememberSaveable { mutableStateOf(initialCategory) }
    val visibleCategories = remember(isAdmin) {
        SettingsCategory.values().filter { it != SettingsCategory.ADMIN || isAdmin }
    }
    LaunchedEffect(isAdmin) {
        if (selectedCategory !in visibleCategories) selectedCategory = SettingsCategory.SERVER
    }
    LaunchedEffect(selectedCategory) {
        when (selectedCategory) {
            SettingsCategory.SECURITY -> onLoadSessions()
            SettingsCategory.ADMIN -> {
                onLoadAdminSettings()
                onLoadAdminAuditLog()
            }
            SettingsCategory.AUDIT -> onLoadAdminAuditLog()
            else -> Unit
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.9f),
            shape = MaterialTheme.shapes.large,
            tonalElevation = 6.dp,
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Settings", style = MaterialTheme.typography.headlineSmall)
                        Text(
                            "Manage your Sticker Foundry mobile workspace.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Outlined.Close, contentDescription = "Close settings")
                    }
                }
                Spacer(modifier = Modifier.padding(4.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    visibleCategories.forEach { category ->
                        if (category == selectedCategory) {
                            Button(onClick = { selectedCategory = category }) {
                                Text(category.title)
                            }
                        } else {
                            TextButton(onClick = { selectedCategory = category }) {
                                Text(category.title)
                            }
                        }
                    }
                }
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    when (selectedCategory) {
                        SettingsCategory.SERVER -> ServerSettingsPanel(
                            serverUrl = serverUrl,
                            serverStatus = serverStatus,
                            checkingServer = checkingServer,
                            onSaveServerUrl = onSaveServerUrl,
                            onCheckServerUrl = onCheckServerUrl,
                        )
                        SettingsCategory.APPEARANCE -> AppearanceSettingsCard(
                            darkTheme = darkTheme,
                            onToggleTheme = onToggleTheme,
                        )
                        SettingsCategory.ACCOUNT -> AccountSettingsCard(
                            account = account,
                            onLogout = onLogout,
                        )
                        SettingsCategory.SECURITY -> SecuritySettingsCard(
                            sessions = sessions,
                            onChangePassword = onChangePassword,
                            onRevokeSession = onRevokeSession,
                            onRevokeAllSessions = onRevokeAllSessions,
                        )
                        SettingsCategory.TEAMS -> TeamsSettingsCard(
                            teams = teams,
                            onCreateTeam = onCreateTeam,
                            members = teamMembers,
                            onLoadMembers = onLoadTeamMembers,
                            onAddMember = onAddTeamMember,
                            onUpdateMember = onUpdateTeamMember,
                            onRemoveMember = onRemoveTeamMember,
                            onAcceptInvite = onAcceptInvite,
                        )
                        SettingsCategory.PROCESSING -> ProcessingSettingsCard(adminSettings)
                        SettingsCategory.STORAGE -> StorageSettingsCard(
                            cacheUsage = cacheUsage,
                            onClearCache = onClearCache,
                        )
                        SettingsCategory.AUDIT -> AuditSettingsCard(
                            entries = adminAuditLog,
                            onLoad = onLoadAdminAuditLog,
                            onCleanup = onCleanupAuditLog,
                            onExport = onExportAuditLog,
                        )
                        SettingsCategory.ADMIN -> AdminSettingsCard(
                            settings = adminSettings,
                            onSave = onUpdateAdminSettings,
                        )
                        SettingsCategory.HELP -> HelpSettingsCard(onTroubleshooting = onTroubleshooting)
                    }
                }
            }
        }
    }
}

@Composable
private fun SecuritySettingsCard(
    sessions: List<UserSessionDto>,
    onChangePassword: (String, String) -> Unit,
    onRevokeSession: (String) -> Unit,
    onRevokeAllSessions: () -> Unit,
) {
    var currentPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Security", style = MaterialTheme.typography.titleMedium)
            Text("Change your password and manage active sessions.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            FoundryPasswordField(currentPassword, { currentPassword = it }, "Current password", Modifier.fillMaxWidth())
            FoundryPasswordField(newPassword, { newPassword = it }, "New password", Modifier.fillMaxWidth())
            Button(
                enabled = currentPassword.isNotBlank() && newPassword.length >= 8,
                onClick = { onChangePassword(currentPassword, newPassword); currentPassword = ""; newPassword = "" },
            ) { Text("Change password") }
            HorizontalDivider()
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Active sessions", style = MaterialTheme.typography.titleSmall)
                TextButton(onClick = onRevokeAllSessions, enabled = sessions.isNotEmpty()) { Text("Revoke all") }
            }
            if (sessions.isEmpty()) {
                Text("No active sessions found.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                sessions.forEach { session ->
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Started ${session.createdAt.take(19).replace('T', ' ')}", style = MaterialTheme.typography.bodySmall)
                            Text("Expires ${session.expiresAt.take(19).replace('T', ' ')}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        TextButton(onClick = { onRevokeSession(session.id) }) { Text("Revoke") }
                    }
                }
            }
        }
    }
}

@Composable
private fun TeamsSettingsCard(
    teams: List<TeamDto>,
    onCreateTeam: (CreateTeamRequest) -> Unit,
    members: List<TeamMemberDto>,
    onLoadMembers: (String) -> Unit,
    onAddMember: (String, String, String) -> Unit,
    onUpdateMember: (String, String, String) -> Unit,
    onRemoveMember: (String, String) -> Unit,
    onAcceptInvite: (String) -> Unit,
) {
    var showCreate by remember { mutableStateOf(false) }
    var selectedTeamId by rememberSaveable { mutableStateOf<String?>(null) }
    var memberEmail by remember { mutableStateOf("") }
    var memberRole by remember { mutableStateOf("EDITOR") }
    var inviteCode by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Column { Text("Teams", style = MaterialTheme.typography.titleMedium); Text("Shared ownership and collaboration.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                Button(onClick = { showCreate = !showCreate }) { Text("New team") }
            }
            if (teams.isEmpty()) Text("You are not part of a team yet.", style = MaterialTheme.typography.bodySmall)
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(inviteCode, { inviteCode = it }, label = { Text("Pack invite code") }, modifier = Modifier.weight(1f), singleLine = true)
                Button(enabled = inviteCode.isNotBlank(), onClick = { onAcceptInvite(inviteCode.trim()); inviteCode = "" }) { Text("Accept") }
            }
            teams.forEach { team ->
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(team.name, style = MaterialTheme.typography.titleSmall)
                        Text("${team.memberCount} members · ${team.packCount} packs · ${team.role ?: "member"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    TextButton(onClick = { selectedTeamId = team.id; onLoadMembers(team.id) }) { Text(if (selectedTeamId == team.id) "Selected" else "Manage") }
                }
                if (selectedTeamId == team.id) {
                    HorizontalDivider()
                    Text("Members", style = MaterialTheme.typography.titleSmall)
                    members.forEach { member ->
                        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(member.user.displayName, style = MaterialTheme.typography.bodySmall)
                                Text(member.user.email, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            TextButton(onClick = { onUpdateMember(team.id, member.id, if (member.role == "EDITOR") "VIEWER" else "EDITOR") }) { Text(member.role) }
                            TextButton(onClick = { onRemoveMember(team.id, member.id) }) { Text("Remove") }
                        }
                    }
                    OutlinedTextField(memberEmail, { memberEmail = it }, label = { Text("Member email") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextButton(onClick = { memberRole = if (memberRole == "EDITOR") "VIEWER" else "EDITOR" }) { Text("Role: $memberRole") }
                        Button(enabled = memberEmail.isNotBlank(), onClick = { onAddMember(team.id, memberEmail.trim(), memberRole); memberEmail = "" }) { Text("Add member") }
                    }
                }
            }
            if (showCreate) {
                HorizontalDivider()
                OutlinedTextField(name, { name = it }, label = { Text("Team name") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                OutlinedTextField(description, { description = it }, label = { Text("Description (optional)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(enabled = name.isNotBlank(), onClick = { onCreateTeam(CreateTeamRequest(name.trim(), description.trim().ifBlank { null })); name = ""; description = ""; showCreate = false }) { Text("Create team") }
                    TextButton(onClick = { showCreate = false }) { Text("Cancel") }
                }
            }
        }
    }
}

@Composable
private fun ProcessingSettingsCard(settings: AdminSettingsDto?) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Processing", style = MaterialTheme.typography.titleMedium)
            Text("Background removal", style = MaterialTheme.typography.titleSmall)
            val background = settings?.backgroundRemoval
            Text(
                when {
                    background == null -> "Loading processing capabilities…"
                    background.aiCommandConfigured -> "rembg is configured and will be used as the primary AI processor. Threshold fallback remains available."
                    else -> "rembg is not configured on the server. Threshold fallback will be used."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun AuditSettingsCard(
    entries: List<AuditLogEntryDto>,
    onLoad: () -> Unit,
    onCleanup: () -> Unit,
    onExport: () -> Unit,
) {
    var pageSize by rememberSaveable { mutableStateOf(10) }
    var page by rememberSaveable { mutableStateOf(1) }
    val totalPages = if (pageSize == 0) 1 else maxOf(1, (entries.size + pageSize - 1) / pageSize)
    val currentPage = page.coerceIn(1, totalPages)
    val visible = if (pageSize == 0) entries else entries.drop((currentPage - 1) * pageSize).take(pageSize)
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Column { Text("Audit log", style = MaterialTheme.typography.titleMedium); Text("Security events for this account or instance.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                Row { TextButton(onClick = onLoad) { Text("Refresh") }; TextButton(onClick = onExport) { Text("Export") } }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                listOf(10, 25, 100, 0).forEach { size ->
                    if (pageSize == size) Button(onClick = { pageSize = size; page = 1 }) { Text(if (size == 0) "All" else size.toString()) }
                    else TextButton(onClick = { pageSize = size; page = 1 }) { Text(if (size == 0) "All" else size.toString()) }
                }
            }
            visible.forEach { entry ->
                Column(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                    Text(entry.action, style = MaterialTheme.typography.bodySmall)
                    Text("${entry.entityType} · ${entry.actor?.email ?: "System"} · ${entry.createdAt.take(19).replace('T', ' ')}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (visible.isEmpty()) Text("No audit events yet.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Page $currentPage of $totalPages", style = MaterialTheme.typography.labelSmall)
                Row { TextButton(enabled = currentPage > 1, onClick = { page = currentPage - 1 }) { Text("Previous") }; TextButton(enabled = currentPage < totalPages, onClick = { page = currentPage + 1 }) { Text("Next") } }
            }
            TextButton(onClick = onCleanup, enabled = entries.isNotEmpty()) { Text("Clean up old entries") }
        }
    }
}

@Composable
private fun AdminSettingsCard(settings: AdminSettingsDto?, onSave: (UpdateAdminSettingsRequest) -> Unit) {
    var registrationMode by remember(settings) { mutableStateOf(settings?.registrationMode ?: "open") }
    var inviteCode by remember(settings) { mutableStateOf(settings?.registrationInviteCode.orEmpty()) }
    var quotaMb by remember(settings) { mutableStateOf(settings?.storageQuotaBytes?.let { (it / 1024 / 1024).toString() }.orEmpty()) }
    var retentionDays by remember(settings) { mutableStateOf(settings?.auditRetentionDays?.toString().orEmpty()) }
    var instanceName by remember(settings) { mutableStateOf(settings?.instanceName.orEmpty()) }
    var instanceDescription by remember(settings) { mutableStateOf(settings?.instanceDescription.orEmpty()) }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Administration", style = MaterialTheme.typography.titleMedium)
            if (settings == null) Text("Loading administrator settings…", style = MaterialTheme.typography.bodySmall)
            OutlinedTextField(instanceName, { instanceName = it }, label = { Text("Instance name") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(instanceDescription, { instanceDescription = it }, label = { Text("Instance description") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(registrationMode, { registrationMode = it }, label = { Text("Registration mode: open / invite-only / disabled") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(inviteCode, { inviteCode = it }, label = { Text("Registration invite code") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(quotaMb, { quotaMb = it }, label = { Text("Storage quota (MB, optional)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(retentionDays, { retentionDays = it }, label = { Text("Audit retention (days, optional)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            Button(enabled = settings != null, onClick = {
                onSave(UpdateAdminSettingsRequest(registrationMode.trim(), inviteCode.trim().ifBlank { null }, quotaMb.toLongOrNull()?.times(1024 * 1024), retentionDays.toIntOrNull(), instanceName.trim(), instanceDescription.trim()))
            }) { Text("Save administrator settings") }
        }
    }
}

@Composable
private fun AppearanceSettingsCard(darkTheme: Boolean, onToggleTheme: (Boolean) -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Appearance", style = MaterialTheme.typography.titleMedium)
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column {
                    Text(if (darkTheme) "Dark theme" else "Light theme")
                    Text(
                        "This preference is saved on this device.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = darkTheme, onCheckedChange = onToggleTheme)
            }
        }
    }
}

@Composable
private fun AccountSettingsCard(account: String, onLogout: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Account", style = MaterialTheme.typography.titleMedium)
            Text(account, style = MaterialTheme.typography.bodyMedium)
            TextButton(onClick = onLogout) { Text("Logout") }
        }
    }
}

@Composable
private fun StorageSettingsCard(cacheUsage: String, onClearCache: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Storage", style = MaterialTheme.typography.titleMedium)
            Text("Local cache usage: $cacheUsage", style = MaterialTheme.typography.bodyMedium)
            TextButton(onClick = onClearCache) { Text("Clear cache") }
        }
    }
}

@Composable
private fun HelpSettingsCard(onTroubleshooting: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Help", style = MaterialTheme.typography.titleMedium)
            Text(
                "Use troubleshooting when WhatsApp cannot see a synced pack or tray icon.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(onClick = onTroubleshooting) { Text("Import troubleshooting") }
        }
    }
}

@Composable
fun ServerSettingsPanel(
    serverUrl: String,
    serverStatus: AppStatus,
    checkingServer: Boolean,
    onSaveServerUrl: (String) -> Unit,
    onCheckServerUrl: (String) -> Unit,
) {
    var editedServerUrl by remember(serverUrl) { mutableStateOf(serverUrl) }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("Server connection", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(
                value = editedServerUrl,
                onValueChange = { editedServerUrl = it },
                label = { Text("Server URL") },
                supportingText = { Text("Example: http://192.168.1.20:8080/api/") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { onSaveServerUrl(editedServerUrl) }) {
                    Text("Save URL")
                }
                TextButton(
                    enabled = !checkingServer,
                    onClick = { onCheckServerUrl(editedServerUrl) },
                ) {
                    Text(if (checkingServer) "Checking..." else "Test server")
                }
            }
            if (serverStatus.message.isNotBlank()) {
                Text(
                    serverStatus.message,
                    color = if (serverStatus.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
fun SettingsPanel(
    account: String,
    cacheUsage: String,
    darkTheme: Boolean,
    onLogout: () -> Unit,
    onClearCache: () -> Unit,
    onToggleTheme: (Boolean) -> Unit,
    onTroubleshooting: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Preferences", style = MaterialTheme.typography.titleMedium)
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column {
                    Text(if (darkTheme) "Dark theme" else "Light theme")
                    Text(
                        "This preference is saved on this device.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = darkTheme, onCheckedChange = onToggleTheme)
            }
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
    }
}

@Composable
fun ImportTroubleshootingDialog(onDismiss: () -> Unit) {
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

