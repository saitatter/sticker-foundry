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
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
                    modifier = Modifier
                        .fillMaxSize()
                        .safeDrawingPadding(),
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

private enum class AppDestination {
    HOME,
    PACKS,
    SETTINGS,
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
    var showTroubleshooting by remember { mutableStateOf(false) }
    var destination by rememberSaveable { mutableStateOf(AppDestination.HOME) }
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
            .padding(top = 12.dp, start = 16.dp, end = 16.dp),
    ) {
        FoundryHeader(darkTheme = darkTheme, onToggleTheme = onToggleTheme)
        Spacer(modifier = Modifier.height(12.dp))
        Box(modifier = Modifier.weight(1f)) {
            when (destination) {
                AppDestination.HOME -> HomeScreen(
                    account = account,
                    packs = packs,
                    status = status,
                    onSync = { viewModel.sync() },
                    onOpenPacks = { destination = AppDestination.PACKS },
                )
                AppDestination.PACKS -> PacksScreen(
                    packs = packs,
                    stickersByPack = stickersByPack,
                    status = status,
                    context = context,
                    onSync = { viewModel.sync() },
                    onSyncPack = { viewModel.syncPack(it) },
                    onClearPackCache = { viewModel.clearPackCache(it) },
                    onUploadSticker = { pack ->
                        stickerUploadPackId = pack.id
                        stickerUploadPackAnimated = pack.isAnimated
                        stickerPicker.launch("image/*")
                    },
                    onReplaceTrayIcon = { pack ->
                        trayIconPackId = pack.id
                        trayIconPicker.launch("image/*")
                    },
                    onExport = { viewModel.exportPack(it) },
                )
                AppDestination.SETTINGS -> SettingsScreen(
                    serverUrl = serverUrl,
                    serverStatus = serverStatus,
                    checkingServer = checkingServer,
                    account = account,
                    cacheUsage = cacheUsage,
                    darkTheme = darkTheme,
                    status = status,
                    onSaveServerUrl = { viewModel.saveServerUrl(it) },
                    onCheckServerUrl = { viewModel.checkServerUrl(it) },
                    onLogin = { email, password -> viewModel.login(email, password) },
                    onLogout = { viewModel.logout() },
                    onClearCache = { viewModel.clearCache() },
                    onToggleTheme = onToggleTheme,
                    onTroubleshooting = { showTroubleshooting = true },
                )
            }
        }
        MobileNavigationBar(
            selected = destination,
            onSelect = { destination = it },
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

@Composable
private fun HomeScreen(
    account: String,
    packs: List<com.stickerfoundry.app.data.PackEntity>,
    status: AppStatus,
    onSync: () -> Unit,
    onOpenPacks: () -> Unit,
) {
    val readyPacks = packs.count { it.extractionStatus == com.stickerfoundry.app.data.EXTRACTION_READY }
    val stickerCount = packs.sumOf { it.stickerCount }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Home", style = MaterialTheme.typography.headlineSmall)
        Text(
            if (account == "Not logged in") "Connect your account from Settings to sync packs." else "Welcome back, $account",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        StatusMessage(status)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SummaryCard("Packs", packs.size.toString(), Modifier.weight(1f))
            SummaryCard("Stickers", stickerCount.toString(), Modifier.weight(1f))
            SummaryCard("Ready", readyPacks.toString(), Modifier.weight(1f))
        }
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("Keep your library current", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Sync the latest pack changes and keep an offline copy ready for WhatsApp.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    androidx.compose.material3.Button(onClick = onSync) { Text("Sync packs") }
                    androidx.compose.material3.TextButton(onClick = onOpenPacks) { Text("View library") }
                }
            }
        }
        if (packs.isEmpty()) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Your library is empty", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Sign in from Settings, then sync to see your sticker packs here.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else {
            Text("Recent packs", style = MaterialTheme.typography.titleMedium)
            packs.take(3).forEach { pack ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(pack.name, style = MaterialTheme.typography.titleSmall)
                            Text(
                                "${pack.stickerCount} stickers · ${if (pack.isPublic) "Public" else "Private"}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        androidx.compose.material3.TextButton(onClick = onOpenPacks) { Text("Open") }
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier = modifier) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(value, style = MaterialTheme.typography.titleLarge)
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun PacksScreen(
    packs: List<com.stickerfoundry.app.data.PackEntity>,
    stickersByPack: Map<String, List<com.stickerfoundry.app.data.StickerEntity>>,
    status: AppStatus,
    context: Context,
    onSync: () -> Unit,
    onSyncPack: (String) -> Unit,
    onClearPackCache: (String) -> Unit,
    onUploadSticker: (com.stickerfoundry.app.data.PackEntity) -> Unit,
    onReplaceTrayIcon: (com.stickerfoundry.app.data.PackEntity) -> Unit,
    onExport: (String) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Packs", style = MaterialTheme.typography.headlineSmall)
                Text("Your synced sticker library", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            androidx.compose.material3.Button(onClick = onSync) { Text("Sync") }
        }
        StatusMessage(status)
        if (packs.isEmpty()) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("No packs synced yet", style = MaterialTheme.typography.titleMedium)
                    Text("Sign in from Settings, then sync your library.", style = MaterialTheme.typography.bodySmall)
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(packs, key = { it.id }) { pack ->
                    PackRow(
                        pack = pack,
                        stickers = stickersByPack[pack.id].orEmpty(),
                        onAdd = { WhatsAppStickerLauncher.addPack(context, pack) },
                        onAddBusiness = { WhatsAppStickerLauncher.addPackToBusiness(context, pack) },
                        onResync = { onSyncPack(pack.id) },
                        onClearLocal = { onClearPackCache(pack.id) },
                        onUploadSticker = { onUploadSticker(pack) },
                        onReplaceTrayIcon = { onReplaceTrayIcon(pack) },
                        onExport = { onExport(pack.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SettingsScreen(
    serverUrl: String,
    serverStatus: AppStatus,
    checkingServer: Boolean,
    account: String,
    cacheUsage: String,
    darkTheme: Boolean,
    status: AppStatus,
    onSaveServerUrl: (String) -> Unit,
    onCheckServerUrl: (String) -> Unit,
    onLogin: (String, String) -> Unit,
    onLogout: () -> Unit,
    onClearCache: () -> Unit,
    onToggleTheme: (Boolean) -> Unit,
    onTroubleshooting: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Settings", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Connect the app, manage your account, and tune the local experience.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        LoginBox(
            serverUrl = serverUrl,
            serverStatus = serverStatus,
            checkingServer = checkingServer,
            onSaveServerUrl = onSaveServerUrl,
            onCheckServerUrl = onCheckServerUrl,
            onLogin = onLogin,
            status = status,
        )
        SettingsPanel(
            account = account,
            cacheUsage = cacheUsage,
            darkTheme = darkTheme,
            onLogout = onLogout,
            onClearCache = onClearCache,
            onToggleTheme = onToggleTheme,
            onTroubleshooting = onTroubleshooting,
        )
    }
}

@Composable
private fun StatusMessage(status: AppStatus) {
    if (status.message.isNotBlank()) {
        Text(
            status.message,
            color = if (status.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun MobileNavigationBar(
    selected: AppDestination,
    onSelect: (AppDestination) -> Unit,
) {
    NavigationBar {
        AppDestination.values().forEach { destination ->
            NavigationBarItem(
                selected = selected == destination,
                onClick = { onSelect(destination) },
                icon = {
                    Icon(
                        imageVector = when (destination) {
                            AppDestination.HOME -> Icons.Outlined.Home
                            AppDestination.PACKS -> Icons.Outlined.Inventory2
                            AppDestination.SETTINGS -> Icons.Outlined.Settings
                        },
                        contentDescription = destination.name.lowercase().replaceFirstChar { it.uppercase() },
                    )
                },
                label = { Text(destination.name.lowercase().replaceFirstChar { it.uppercase() }) },
            )
        }
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
                painter = painterResource(id = com.stickerfoundry.app.R.drawable.sticker_foundry_foreground),
                contentDescription = "Sticker Foundry",
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(12.dp)),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text("Sticker Foundry", style = MaterialTheme.typography.titleLarge)
                Text("Your WhatsApp sticker workspace", style = MaterialTheme.typography.bodySmall)
            }
            IconButton(
                onClick = { onToggleTheme(!darkTheme) },
                modifier = Modifier.size(48.dp),
            ) {
                Icon(
                    imageVector = if (darkTheme) Icons.Outlined.LightMode else Icons.Outlined.DarkMode,
                    contentDescription = if (darkTheme) "Use light theme" else "Use dark theme",
                )
            }
        }
    }
}
