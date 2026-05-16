package com.stickerfoundry.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.stickerfoundry.app.data.ImageEditOptions
import com.stickerfoundry.app.whatsapp.WhatsAppStickerLauncher

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
    val stickersByPack by viewModel.stickersByPack.collectAsState()
    val status by viewModel.status.collectAsState()
    val serverStatus by viewModel.serverStatus.collectAsState()
    val checkingServer by viewModel.checkingServer.collectAsState()
    val serverUrl by viewModel.serverUrl.collectAsState()
    val account by viewModel.account.collectAsState()
    val cacheUsage by viewModel.cacheUsage.collectAsState()
    val context = LocalContext.current
    var stickerUploadPackId by remember { mutableStateOf<String?>(null) }
    var stickerUploadPackAnimated by remember { mutableStateOf(false) }
    var trayIconPackId by remember { mutableStateOf<String?>(null) }
    var pendingEdit by remember { mutableStateOf<PendingImageEdit?>(null) }
    var showSettings by remember { mutableStateOf(false) }
    var showTroubleshooting by remember { mutableStateOf(false) }
    val stickerPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val packId = stickerUploadPackId
        val isAnimated = stickerUploadPackAnimated
        stickerUploadPackId = null
        stickerUploadPackAnimated = false
        if (uri != null && packId != null) {
            pendingEdit = PendingImageEdit(packId, uri, ImageEditTarget.Sticker, isAnimated)
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
            onSettings = {
                viewModel.refreshCacheUsage()
                showSettings = true
            },
            status = status,
        )

        if (packs.isEmpty()) {
            Text("No packs synced yet", style = MaterialTheme.typography.bodyMedium)
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(packs, key = { it.id }) { pack ->
                    PackRow(
                        pack = pack,
                        stickers = stickersByPack[pack.id].orEmpty(),
                        onAdd = { WhatsAppStickerLauncher.addPack(context, pack) },
                        onAddBusiness = { WhatsAppStickerLauncher.addPackToBusiness(context, pack) },
                        onResync = { viewModel.syncPack(pack.id) },
                        onClearLocal = { viewModel.clearPackCache(pack.id) },
                        onUploadSticker = {
                            stickerUploadPackId = pack.id
                            stickerUploadPackAnimated = pack.isAnimated
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

    if (showSettings) {
        SettingsDialog(
            serverUrl = serverUrl,
            serverStatus = serverStatus,
            checkingServer = checkingServer,
            account = account,
            cacheUsage = cacheUsage,
            onSaveServerUrl = { viewModel.saveServerUrl(it) },
            onCheckServerUrl = { viewModel.checkServerUrl(it) },
            onLogout = { viewModel.logout() },
            onClearCache = { viewModel.clearCache() },
            onTroubleshooting = { showTroubleshooting = true },
            onDismiss = { showSettings = false },
        )
    }

    if (showTroubleshooting) {
        ImportTroubleshootingDialog(onDismiss = { showTroubleshooting = false })
    }

    pendingEdit?.let { edit ->
        ImageEditDialog(
            edit = edit,
            onDismiss = { pendingEdit = null },
            onSubmit = { options: ImageEditOptions ->
                when (edit.target) {
                    ImageEditTarget.Sticker -> viewModel.uploadSticker(edit.packId, edit.uri, options)
                    ImageEditTarget.TrayIcon -> viewModel.replaceTrayIcon(edit.packId, edit.uri, options)
                }
                pendingEdit = null
            },
        )
    }
}
