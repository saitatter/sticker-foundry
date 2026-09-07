package com.stickerfoundry.app

import android.graphics.Color as AndroidColor
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.core.content.FileProvider
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.stickerfoundry.app.data.ImageEditOptions
import com.stickerfoundry.app.data.StickerRepository
import com.stickerfoundry.app.ui.theme.StickerFoundryTheme
import com.stickerfoundry.app.whatsapp.WhatsAppStickerLauncher
import java.io.File

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        applySystemBars(StickerRepository.get(this).darkTheme())
        setContent {
            val appViewModel: StickerViewModel = viewModel(factory = StickerViewModel.factory(this@MainActivity))
            val darkTheme by appViewModel.darkTheme.collectAsState()
            SideEffect {
                applySystemBars(darkTheme)
            }
            StickerFoundryTheme(darkTheme = darkTheme) {
                Surface(
                    color = MaterialTheme.colorScheme.background,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    StickerApp(
                        viewModel = appViewModel,
                        darkTheme = darkTheme,
                        onToggleTheme = appViewModel::setDarkTheme,
                    )
                }
            }
        }
    }
}

private fun shareExport(context: Context, file: File) {
    val uri = FileProvider.getUriForFile(context, "${BuildConfig.APPLICATION_ID}.fileprovider", file)
    val shareIntent = Intent(Intent.ACTION_SEND).apply {
        type = "application/zip"
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(shareIntent, "Share sticker pack export"))
}

@Composable
private fun StickerApp(
    viewModel: StickerViewModel,
    darkTheme: Boolean,
    onToggleTheme: (Boolean) -> Unit,
) {
    val packs by viewModel.packs.collectAsState()
    val stickersByPack by viewModel.stickersByPack.collectAsState()
    val status by viewModel.status.collectAsState()
    val serverStatus by viewModel.serverStatus.collectAsState()
    val checkingServer by viewModel.checkingServer.collectAsState()
    val serverUrl by viewModel.serverUrl.collectAsState()
    val account by viewModel.account.collectAsState()
    val cacheUsage by viewModel.cacheUsage.collectAsState()
    val context = LocalContext.current
    LaunchedEffect(viewModel) {
        viewModel.exportEvents.collect { file -> shareExport(context, file) }
    }
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
        FoundryHeader(darkTheme = darkTheme, onToggleTheme = onToggleTheme)
        LoginBox(
            serverUrl = serverUrl,
            serverStatus = serverStatus,
            checkingServer = checkingServer,
            onSaveServerUrl = { viewModel.saveServerUrl(it) },
            onCheckServerUrl = { viewModel.checkServerUrl(it) },
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
                        onExport = { viewModel.exportPack(pack.id) },
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
            darkTheme = darkTheme,
            onSaveServerUrl = { viewModel.saveServerUrl(it) },
            onCheckServerUrl = { viewModel.checkServerUrl(it) },
            onLogout = { viewModel.logout() },
            onClearCache = { viewModel.clearCache() },
            onToggleTheme = onToggleTheme,
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

private fun MainActivity.applySystemBars(darkTheme: Boolean) {
    val chromeColor = AndroidColor.parseColor(if (darkTheme) "#0D1716" else "#F5F7F8")
    window.statusBarColor = chromeColor
    window.navigationBarColor = chromeColor
    WindowCompat.getInsetsController(window, window.decorView).apply {
        isAppearanceLightStatusBars = !darkTheme
        isAppearanceLightNavigationBars = !darkTheme
    }
}

@Composable
private fun FoundryHeader(darkTheme: Boolean, onToggleTheme: (Boolean) -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Image(
                painter = painterResource(id = com.stickerfoundry.app.R.mipmap.ic_launcher),
                contentDescription = "Sticker Foundry",
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(12.dp)),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text("Sticker Foundry", style = MaterialTheme.typography.titleLarge)
                Text("Your WhatsApp sticker workspace", style = MaterialTheme.typography.bodySmall)
            }
            OutlinedButton(onClick = { onToggleTheme(!darkTheme) }) {
                Text(if (darkTheme) "Use light" else "Use dark")
            }
        }
    }
}
