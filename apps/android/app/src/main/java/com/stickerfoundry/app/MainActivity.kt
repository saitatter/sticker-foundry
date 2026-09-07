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
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.HelpOutline
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.PersonOutline
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Storage
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.Sync
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
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
    val isLoggedIn by viewModel.isLoggedIn.collectAsState()
    val serverVersion by viewModel.serverVersion.collectAsState()
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
    var showProfileMenu by remember { mutableStateOf(false) }
    var showSettingsWindow by remember { mutableStateOf(false) }
    var settingsCategory by rememberSaveable { mutableStateOf(SettingsCategory.SERVER) }
    var destination by rememberSaveable { mutableStateOf(AppDestination.HOME) }
    LaunchedEffect(isLoggedIn) {
        if (!isLoggedIn) destination = AppDestination.HOME
    }
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

    if (!isLoggedIn) {
        LoginScreen(
            darkTheme = darkTheme,
            serverUrl = serverUrl,
            serverStatus = serverStatus,
            checkingServer = checkingServer,
            status = status,
            onToggleTheme = onToggleTheme,
            onSaveServerUrl = { viewModel.saveServerUrl(it) },
            onCheckServerUrl = { viewModel.checkServerUrl(it) },
            onLogin = { email, password -> viewModel.login(email, password) },
        )
    } else {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            containerColor = MaterialTheme.colorScheme.background,
            topBar = {
                FoundryHeader(
                    darkTheme = darkTheme,
                    account = account,
                    onToggleTheme = onToggleTheme,
                    onRefresh = { viewModel.sync() },
                    onProfileClick = {
                        viewModel.refreshServerInfo()
                        showProfileMenu = true
                    },
                )
            },
            bottomBar = {
                MobileNavigationBar(
                    selected = destination,
                    onSelect = { destination = it },
                )
            },
        ) { innerPadding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            ) {
                Crossfade(
                    targetState = destination,
                    animationSpec = androidx.compose.animation.core.tween(durationMillis = 280),
                    label = "mobile-destination",
                ) { currentDestination ->
                    when (currentDestination) {
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
                            account = account,
                            cacheUsage = cacheUsage,
                            darkTheme = darkTheme,
                            onOpenCategory = { category ->
                                settingsCategory = category
                                showSettingsWindow = true
                            },
                        )
                    }
                }
            }
        }
    }

    if (showProfileMenu) {
        ProfileDialog(
            account = account,
            serverUrl = serverUrl,
            serverVersion = serverVersion,
            onSettings = {
                showProfileMenu = false
                showSettingsWindow = true
            },
            onDismiss = { showProfileMenu = false },
        )
    }

    if (showSettingsWindow) {
        SettingsWindow(
            initialCategory = settingsCategory,
            serverUrl = serverUrl,
            serverStatus = serverStatus,
            checkingServer = checkingServer,
            account = account,
            cacheUsage = cacheUsage,
            darkTheme = darkTheme,
            onSaveServerUrl = { viewModel.saveServerUrl(it) },
            onCheckServerUrl = { viewModel.checkServerUrl(it) },
            onLogout = { showSettingsWindow = false; viewModel.logout() },
            onClearCache = { viewModel.clearCache() },
            onToggleTheme = onToggleTheme,
            onTroubleshooting = { showTroubleshooting = true },
            onDismiss = { showSettingsWindow = false },
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
private fun LoginScreen(
    darkTheme: Boolean,
    serverUrl: String,
    serverStatus: AppStatus,
    checkingServer: Boolean,
    status: AppStatus,
    onToggleTheme: (Boolean) -> Unit,
    onSaveServerUrl: (String) -> Unit,
    onCheckServerUrl: (String) -> Unit,
    onLogin: (String, String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Spacer(modifier = Modifier.weight(1f))
            IconButton(onClick = { onToggleTheme(!darkTheme) }) {
                Icon(
                    imageVector = if (darkTheme) Icons.Outlined.LightMode else Icons.Outlined.DarkMode,
                    contentDescription = if (darkTheme) "Use light theme" else "Use dark theme",
                )
            }
        }
        Spacer(modifier = Modifier.height(36.dp))
        Image(
            painter = painterResource(id = com.stickerfoundry.app.R.drawable.sticker_foundry_foreground),
            contentDescription = "Sticker Foundry",
            modifier = Modifier
                .size(72.dp)
                .clip(RoundedCornerShape(20.dp)),
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text("Sticker Foundry", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        Text(
            "Your private workspace for WhatsApp sticker packs",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(24.dp))
        LoginBox(
            serverUrl = serverUrl,
            serverStatus = serverStatus,
            checkingServer = checkingServer,
            onSaveServerUrl = onSaveServerUrl,
            onCheckServerUrl = onCheckServerUrl,
            onLogin = onLogin,
            status = status,
        )
        Spacer(modifier = Modifier.height(14.dp))
        Text(
            "v${BuildConfig.VERSION_NAME}  ·  Local-first sticker management",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(16.dp))
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
    val needsAttention = packs.count { it.extractionStatus != com.stickerfoundry.app.data.EXTRACTION_READY }
    val stickerCount = packs.sumOf { it.stickerCount }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Home", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            Text("Welcome back, $account", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        StatusMessage(status)
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(MaterialTheme.colorScheme.primaryContainer),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Outlined.CloudDone, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    }
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("Library status", style = MaterialTheme.typography.titleMedium)
                        Text(
                            if (needsAttention == 0) "Everything is ready for WhatsApp" else "$needsAttention pack(s) need attention",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(onClick = onSync) {
                        Icon(Icons.Outlined.Sync, contentDescription = "Sync packs")
                    }
                }
                TextButton(onClick = onOpenPacks) { Text("Open packs") }
            }
        }
        Text("At a glance", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CollectionTile(Icons.Outlined.Inventory2, "Packs", packs.size.toString(), Modifier.weight(1f), onOpenPacks)
            CollectionTile(Icons.Outlined.Home, "Ready", readyPacks.toString(), Modifier.weight(1f), onOpenPacks)
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CollectionTile(Icons.Outlined.Star, "Stickers", stickerCount.toString(), Modifier.weight(1f), onOpenPacks)
            CollectionTile(Icons.Outlined.Settings, "Needs work", needsAttention.toString(), Modifier.weight(1f), onOpenPacks)
        }
        if (packs.isEmpty()) {
            EmptyLibraryCard(onOpenPacks)
        } else {
            Text("Recent packs", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            packs.take(3).forEach { pack ->
                RecentPackRow(pack = pack, onOpen = onOpenPacks)
            }
        }
    }
}

@Composable
private fun CollectionTile(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Card(modifier = modifier.clickable(onClick = onClick)) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun EmptyLibraryCard(onOpenPacks: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Your library is empty", style = MaterialTheme.typography.titleMedium)
            Text(
                "Sync your packs to keep an offline copy ready for WhatsApp.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(onClick = onOpenPacks) { Text("View packs") }
        }
    }
}

@Composable
private fun RecentPackRow(pack: com.stickerfoundry.app.data.PackEntity, onOpen: () -> Unit) {
    val trayPreview = remember(pack.localPath, pack.trayImageFile) {
        loadImageBitmap(File(pack.localPath, pack.trayImageFile).absolutePath)
    }
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen)) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            trayPreview?.let { preview ->
                Image(
                    bitmap = preview,
                    contentDescription = "${pack.name} cover",
                    modifier = Modifier.size(56.dp).clip(RoundedCornerShape(16.dp)),
                    contentScale = ContentScale.Crop,
                )
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(pack.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium)
                Text(
                    "${pack.stickerCount} stickers · ${if (pack.isPublic) "Public" else "Private"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(Icons.Outlined.ChevronRight, contentDescription = "Open ${pack.name}")
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
            IconButton(onClick = onSync) {
                Icon(Icons.Outlined.Sync, contentDescription = "Sync packs")
            }
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
    account: String,
    cacheUsage: String,
    darkTheme: Boolean,
    onOpenCategory: (SettingsCategory) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("Settings", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        Text(
            "Manage your server, appearance, account, and local storage.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(4.dp))
        SettingsMenuRow(
            icon = Icons.Outlined.Settings,
            title = "Server connection",
            subtitle = "Endpoint, connection status, and server version",
            onClick = { onOpenCategory(SettingsCategory.SERVER) },
        )
        SettingsMenuRow(
            icon = if (darkTheme) Icons.Outlined.DarkMode else Icons.Outlined.LightMode,
            title = "Appearance",
            subtitle = if (darkTheme) "Dark theme is enabled" else "Light theme is enabled",
            onClick = { onOpenCategory(SettingsCategory.APPEARANCE) },
        )
        SettingsMenuRow(
            icon = Icons.Outlined.PersonOutline,
            title = "Account",
            subtitle = account,
            onClick = { onOpenCategory(SettingsCategory.ACCOUNT) },
        )
        SettingsMenuRow(
            icon = Icons.Outlined.Storage,
            title = "Storage",
            subtitle = "Local cache: $cacheUsage",
            onClick = { onOpenCategory(SettingsCategory.STORAGE) },
        )
        SettingsMenuRow(
            icon = Icons.Outlined.HelpOutline,
            title = "Help",
            subtitle = "Troubleshooting and import help",
            onClick = { onOpenCategory(SettingsCategory.HELP) },
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            "Sticker Foundry  ·  v${BuildConfig.VERSION_NAME}",
            modifier = Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun SettingsMenuRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.Outlined.ChevronRight, contentDescription = "Open $title")
        }
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
private fun ProfileDialog(
    account: String,
    serverUrl: String,
    serverVersion: String,
    onSettings: () -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            shape = MaterialTheme.shapes.large,
            tonalElevation = 6.dp,
        ) {
            Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("Sticker Foundry", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                        Text(account, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Outlined.Close, contentDescription = "Close profile")
                    }
                }
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            AccountAvatar(account = account, size = 44.dp)
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(account, style = MaterialTheme.typography.titleMedium)
                                Text("Signed in", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        ProfileInfoRow("Server URL", serverUrl)
                        ProfileInfoRow("Server version", serverVersion)
                    }
                }
                ProfileInfoRow("App version", BuildConfig.VERSION_NAME)
                ProfileInfoRow("Latest version", BuildConfig.VERSION_NAME)
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(modifier = Modifier.weight(1f), onClick = onSettings) {
                        Icon(Icons.Outlined.Settings, contentDescription = null)
                        Spacer(modifier = Modifier.size(8.dp))
                        Text("Settings")
                    }
                    TextButton(modifier = Modifier.weight(1f), onClick = onDismiss) { Text("Close") }
                }
            }
        }
    }
}

@Composable
private fun ProfileInfoRow(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun AccountAvatar(account: String, size: androidx.compose.ui.unit.Dp) {
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            accountInitials(account),
            color = MaterialTheme.colorScheme.onPrimaryContainer,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

private fun accountInitials(account: String): String {
    val label = account.substringBefore('<').trim()
    val parts = label.split(Regex("\\s+")).filter { it.isNotBlank() }
    return parts.take(2).joinToString("") { it.first().uppercase() }.ifBlank { "SF" }
}

@Composable
private fun MobileNavigationBar(
    selected: AppDestination,
    onSelect: (AppDestination) -> Unit,
) {
    NavigationBar(
        containerColor = MaterialTheme.colorScheme.surface,
        tonalElevation = 3.dp,
    ) {
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
private fun FoundryHeader(
    darkTheme: Boolean,
    account: String,
    onToggleTheme: (Boolean) -> Unit,
    onRefresh: () -> Unit,
    onProfileClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 8.dp, end = 4.dp, top = 6.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Image(
            painter = painterResource(id = com.stickerfoundry.app.R.drawable.sticker_foundry_foreground),
            contentDescription = "Sticker Foundry",
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(12.dp)),
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text("Sticker Foundry", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text("WhatsApp sticker workspace", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        IconButton(onClick = { onToggleTheme(!darkTheme) }) {
            Icon(
                imageVector = if (darkTheme) Icons.Outlined.LightMode else Icons.Outlined.DarkMode,
                contentDescription = if (darkTheme) "Use light theme" else "Use dark theme",
            )
        }
        IconButton(onClick = onRefresh) {
            Icon(Icons.Outlined.Sync, contentDescription = "Sync packs")
        }
        IconButton(onClick = onProfileClick) {
            AccountAvatar(account = account, size = 34.dp)
        }
    }
}
