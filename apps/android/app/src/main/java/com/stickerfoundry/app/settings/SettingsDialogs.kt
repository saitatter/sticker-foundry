package com.stickerfoundry.app

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
    STORAGE("Storage"),
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
) {
    var selectedCategory by rememberSaveable { mutableStateOf(initialCategory) }

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
                    SettingsCategory.values().forEach { category ->
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
                        SettingsCategory.STORAGE -> StorageSettingsCard(
                            cacheUsage = cacheUsage,
                            onClearCache = onClearCache,
                        )
                        SettingsCategory.HELP -> HelpSettingsCard(onTroubleshooting = onTroubleshooting)
                    }
                }
            }
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

