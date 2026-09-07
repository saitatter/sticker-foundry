package com.stickerfoundry.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

private const val DEMO_EMAIL = "demo@stickerfoundry.local"
private const val DEMO_PASSWORD = "stickerfoundry123"

@Composable
fun LoginBox(
    serverUrl: String,
    serverStatus: AppStatus,
    checkingServer: Boolean,
    onSaveServerUrl: (String) -> Unit,
    onCheckServerUrl: (String) -> Unit,
    onLogin: (String, String) -> Unit,
    onSync: () -> Unit,
    onSettings: () -> Unit,
    status: AppStatus,
) {
    var editedServerUrl by remember(serverUrl) { mutableStateOf(serverUrl) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Connect your account", style = MaterialTheme.typography.titleMedium)
            Text(
                "Set the server once, then sign in and sync your packs.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = editedServerUrl,
                onValueChange = { editedServerUrl = it },
                label = { Text("Server URL") },
                supportingText = { Text("Example: http://192.168.1.20:8080/api/") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    modifier = Modifier.weight(1f),
                    onClick = { onSaveServerUrl(editedServerUrl) },
                ) {
                    Text("Save URL")
                }
                Button(
                    modifier = Modifier.weight(1f),
                    enabled = !checkingServer,
                    onClick = { onCheckServerUrl(editedServerUrl) },
                ) {
                    Text(if (checkingServer) "Checking..." else "Test server")
                }
            }
            if (BuildConfig.DEBUG) {
                OutlinedButton(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        email = DEMO_EMAIL
                        password = DEMO_PASSWORD
                    },
                ) {
                    Text("Use demo account")
                }
                Text(
                    "$DEMO_EMAIL · $DEMO_PASSWORD",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (serverStatus.message.isNotBlank()) {
                Text(
                    serverStatus.message,
                    color = if (serverStatus.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    modifier = Modifier.weight(1f),
                    onClick = { onLogin(email, password) },
                ) {
                    Text("Login")
                }
                Button(
                    modifier = Modifier.weight(1f),
                    onClick = onSync,
                ) {
                    Text("Sync")
                }
                Button(
                    modifier = Modifier.weight(1f),
                    onClick = onSettings,
                ) {
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
}

