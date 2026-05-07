package com.stickerfoundry.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun SettingsDialog(
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

