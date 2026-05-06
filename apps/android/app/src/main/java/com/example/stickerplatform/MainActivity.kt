package com.example.stickerplatform

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
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

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(packs, key = { it.id }) { pack ->
                PackRow(
                    pack = pack,
                    onAdd = { WhatsAppStickerLauncher.addPack(context, pack) },
                )
            }
        }
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
private fun PackRow(pack: PackEntity, onAdd: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(pack.name, style = MaterialTheme.typography.titleMedium)
            Text(pack.publisher, style = MaterialTheme.typography.bodyMedium)
            Text("Version ${pack.imageDataVersion}", style = MaterialTheme.typography.bodySmall)
            Spacer(modifier = Modifier.height(8.dp))
            Button(onClick = onAdd) {
                Text("Add to WhatsApp")
            }
        }
    }
}
