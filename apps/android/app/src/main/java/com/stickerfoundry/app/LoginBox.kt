package com.stickerfoundry.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.widthIn

private const val DEMO_EMAIL = "demo@stickerfoundry.local"
private const val DEMO_PASSWORD = "stickerfoundry123"

@Composable
fun FoundryPasswordField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
) {
    var visible by remember { mutableStateOf(false) }
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        trailingIcon = {
            IconButton(onClick = { visible = !visible }) {
                Icon(
                    imageVector = if (visible) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                    contentDescription = if (visible) "Hide password" else "Show password",
                )
            }
        },
        modifier = modifier,
        singleLine = true,
    )
}

@Composable
fun LoginBox(
    serverUrl: String,
    serverStatus: AppStatus,
    checkingServer: Boolean,
    onSaveServerUrl: (String) -> Unit,
    onCheckServerUrl: (String) -> Unit,
    onLogin: (String, String) -> Unit,
    onRegister: (String, String, String, String?) -> Unit,
    onForgotPassword: (String) -> Unit,
    onResetPassword: (String, String) -> Unit,
    status: AppStatus,
) {
    var editedServerUrl by remember(serverUrl) { mutableStateOf(serverUrl) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var inviteCode by remember { mutableStateOf("") }
    var registerMode by remember { mutableStateOf(false) }
    var showResetDialog by remember { mutableStateOf(false) }

    Card(modifier = Modifier.fillMaxWidth().widthIn(max = 380.dp)) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(if (registerMode) "Create your account" else "Connect your account", style = MaterialTheme.typography.titleMedium)
            Text(
                if (registerMode) "Create an account on this Sticker Foundry server." else "Set the server once, then sign in and sync your packs.",
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
            if (registerMode) {
                OutlinedTextField(
                    value = displayName,
                    onValueChange = { displayName = it },
                    label = { Text("Display name") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
            FoundryPasswordField(
                value = password,
                onValueChange = { password = it },
                label = "Password",
                modifier = Modifier.fillMaxWidth(),
            )
            if (registerMode) {
                OutlinedTextField(
                    value = inviteCode,
                    onValueChange = { inviteCode = it },
                    label = { Text("Invite code (if required)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    modifier = Modifier.weight(1f),
                    enabled = email.isNotBlank() && password.isNotBlank() && (!registerMode || displayName.isNotBlank()),
                    onClick = {
                        if (registerMode) onRegister(email, displayName, password, inviteCode)
                        else onLogin(email, password)
                    },
                ) {
                    Text(if (registerMode) "Create account" else "Login")
                }
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = { registerMode = !registerMode }) {
                    Text(if (registerMode) "Already have an account? Login" else "Create an account")
                }
                if (!registerMode) {
                    TextButton(onClick = { showResetDialog = true }) { Text("Forgot password?") }
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
    if (showResetDialog) {
        var resetEmail by remember { mutableStateOf(email) }
        var resetToken by remember { mutableStateOf("") }
        var resetPassword by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showResetDialog = false },
            title = { Text("Reset password") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Request a reset email, or paste the token from your server here.", style = MaterialTheme.typography.bodySmall)
                    OutlinedTextField(resetEmail, { resetEmail = it }, label = { Text("Email") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    OutlinedTextField(resetToken, { resetToken = it }, label = { Text("Reset token (optional)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    if (resetToken.isNotBlank()) FoundryPasswordField(resetPassword, { resetPassword = it }, "New password", Modifier.fillMaxWidth())
                }
            },
            confirmButton = {
                Button(
                    enabled = if (resetToken.isBlank()) resetEmail.isNotBlank() else resetPassword.length >= 8,
                    onClick = {
                        if (resetToken.isBlank()) onForgotPassword(resetEmail) else onResetPassword(resetToken, resetPassword)
                        showResetDialog = false
                    },
                ) { Text(if (resetToken.isBlank()) "Send reset link" else "Reset password") }
            },
            dismissButton = { TextButton(onClick = { showResetDialog = false }) { Text("Cancel") } },
        )
    }
}

