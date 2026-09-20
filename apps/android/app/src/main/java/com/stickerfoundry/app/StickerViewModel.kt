package com.stickerfoundry.app

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.stickerfoundry.app.data.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import retrofit2.HttpException
import java.io.File
import java.io.IOException
import java.net.ConnectException
import java.net.UnknownHostException
import java.net.UnknownServiceException
import java.net.SocketTimeoutException
import java.util.Locale
import javax.net.ssl.SSLHandshakeException

data class AppStatus(
    val message: String = "",
    val isError: Boolean = false,
)

class StickerViewModel(
    private val repository: StickerRepository,
) : ViewModel() {
    val packs: StateFlow<List<PackEntity>> = repository.observePacks()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val stickersByPack: StateFlow<Map<String, List<StickerEntity>>> = repository.observeStickers()
        .map { stickers -> stickers.groupBy { it.packId } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())

    val status = MutableStateFlow(AppStatus())
    val serverStatus = MutableStateFlow(AppStatus())
    val checkingServer = MutableStateFlow(false)
    val serverUrl = MutableStateFlow(repository.serverUrl())
    val account = MutableStateFlow(repository.accountLabel())
    val isLoggedIn = MutableStateFlow(repository.isLoggedIn())
    val currentUser = MutableStateFlow<UserDto?>(null)
    val remotePacks = MutableStateFlow<List<PackDto>>(emptyList())
    val publicPacks = MutableStateFlow<List<PackDto>>(emptyList())
    val teams = MutableStateFlow<List<TeamDto>>(emptyList())
    val teamMembers = MutableStateFlow<List<TeamMemberDto>>(emptyList())
    val selectedPackId = MutableStateFlow<String?>(null)
    val selectedPack = MutableStateFlow<PackDetailDto?>(null)
    val selectedPackMembers = MutableStateFlow<List<PackMemberDto>>(emptyList())
    val selectedPackInvites = MutableStateFlow<List<PackInviteDto>>(emptyList())
    val selectedPackActivity = MutableStateFlow<List<AuditLogEntryDto>>(emptyList())
    val selectedStickerComments = MutableStateFlow<List<StickerCommentDto>>(emptyList())
    val sessions = MutableStateFlow<List<UserSessionDto>>(emptyList())
    val adminSettings = MutableStateFlow<AdminSettingsDto?>(null)
    val adminAuditLog = MutableStateFlow<List<AuditLogEntryDto>>(emptyList())
    val workspaceLoading = MutableStateFlow(false)
    val activeJobs = MutableStateFlow<List<JobDto>>(emptyList())
    private val jobPackIds = mutableMapOf<String, String>()
    private val jobIsExport = mutableMapOf<String, Boolean>()
    val serverVersion = MutableStateFlow("Not checked")
    val cacheUsage = MutableStateFlow(formatBytes(repository.cacheSizeBytes()))
    val darkTheme = MutableStateFlow(repository.darkTheme())
    private val _exportEvents = MutableSharedFlow<File>(extraBufferCapacity = 1)
    val exportEvents = _exportEvents.asSharedFlow()

    fun login(email: String, password: String) {
        viewModelScope.launch {
            runCatching { repository.login(email, password) }
                .onSuccess {
                    account.value = repository.accountLabel()
                    isLoggedIn.value = true
                    setInfo("Logged in")
                    refreshWorkspace()
                }
                .onFailure { setError(it, "Login failed") }
        }
    }

    fun sync() {
        viewModelScope.launch {
            setInfo("Syncing packs")
            runCatching { repository.sync() }
                .onSuccess {
                    refreshCacheUsage()
                    refreshWorkspace()
                    setInfo("Sync complete")
                }
                .onFailure { setError(it, "Sync failed") }
        }
    }

    fun syncPack(packId: String) {
        viewModelScope.launch {
            setInfo("Syncing pack")
            runCatching { repository.syncPack(packId) }
                .onSuccess {
                    refreshCacheUsage()
                    refreshWorkspace()
                    selectedPackId.value?.let { loadPack(it) }
                    setInfo("Pack synced")
                }
                .onFailure { setError(it, "Pack sync failed") }
        }
    }

    fun saveServerUrl(url: String) {
        viewModelScope.launch {
            runCatching { repository.saveServerUrl(url) }
                .onSuccess {
                    serverUrl.value = repository.serverUrl()
                    serverStatus.value = AppStatus("Saved ${serverUrl.value}")
                    setInfo("Server URL saved")
                }
                .onFailure {
                    serverStatus.value = AppStatus(friendlyError(it, "Server URL update failed"), isError = true)
                    setError(it, "Server URL update failed")
                }
        }
    }

    fun checkServerUrl(url: String) {
        viewModelScope.launch {
            checkingServer.value = true
            serverStatus.value = AppStatus("Checking server")
            runCatching { repository.checkServerUrl(url) }
                .onSuccess { health ->
                    serverVersion.value = health.version ?: "Unknown"
                    serverStatus.value = AppStatus("Connected: ${health.status}")
                    setInfo("Server connection OK")
                }
                .onFailure {
                    serverStatus.value = AppStatus(friendlyError(it, "Server check failed"), isError = true)
                    setError(it, "Server check failed")
                }
            checkingServer.value = false
        }
    }

    fun register(email: String, displayName: String, password: String, inviteCode: String?) {
        viewModelScope.launch {
            runCatching { repository.register(email, displayName, password, inviteCode) }
                .onSuccess {
                    account.value = repository.accountLabel()
                    isLoggedIn.value = true
                    setInfo("Account created")
                    refreshWorkspace()
                }
                .onFailure { setError(it, "Registration failed") }
        }
    }

    fun requestPasswordReset(email: String) {
        viewModelScope.launch {
            runCatching { repository.requestPasswordReset(email) }
                .onSuccess { setInfo("If that email exists, reset instructions were sent") }
                .onFailure { setError(it, "Password reset request failed") }
        }
    }

    fun resetPassword(token: String, newPassword: String) {
        viewModelScope.launch {
            runCatching { repository.resetPassword(token, newPassword) }
                .onSuccess { setInfo("Password reset complete") }
                .onFailure { setError(it, "Password reset failed") }
        }
    }

    fun refreshServerInfo() {
        viewModelScope.launch {
            runCatching { repository.checkServerUrl(serverUrl.value) }
                .onSuccess { health -> serverVersion.value = health.version ?: "Unknown" }
        }
    }

    fun logout() {
        viewModelScope.launch {
            runCatching { repository.logout() }
                .onSuccess {
                    account.value = repository.accountLabel()
                    isLoggedIn.value = false
                    currentUser.value = null
                    remotePacks.value = emptyList()
                    selectedPack.value = null
                    setInfo("Logged out")
                }
                .onFailure { setError(it, "Logout failed") }
        }
    }

    fun refreshCacheUsage() {
        cacheUsage.value = formatBytes(repository.cacheSizeBytes())
    }

    fun setDarkTheme(enabled: Boolean) {
        repository.saveDarkTheme(enabled)
        darkTheme.value = enabled
    }

    fun clearCache() {
        viewModelScope.launch {
            runCatching { repository.clearCache() }
                .onSuccess {
                    refreshCacheUsage()
                    setInfo("Cache cleared")
                }
                .onFailure { setError(it, "Cache cleanup failed") }
        }
    }

    fun clearPackCache(packId: String) {
        viewModelScope.launch {
            runCatching { repository.clearPackCache(packId) }
                .onSuccess {
                    refreshCacheUsage()
                    setInfo("Pack cache cleared")
                }
                .onFailure { setError(it, "Pack cache cleanup failed") }
        }
    }

    fun uploadSticker(packId: String, uri: Uri, options: ImageEditOptions) {
        viewModelScope.launch {
            setInfo("Queuing sticker upload")
            runCatching { repository.queueStickerUpload(packId, uri, options) }
                .onSuccess { job ->
                    jobPackIds[job.id] = packId
                    jobIsExport[job.id] = false
                    activeJobs.value = (activeJobs.value + job).distinctBy { it.id }
                    watchJob(job.id, packId, false)
                }
                .onFailure { setError(it, "Sticker upload failed") }
        }
    }

    fun replaceTrayIcon(packId: String, uri: Uri, options: ImageEditOptions) {
        viewModelScope.launch {
            setInfo("Replacing tray icon")
            runCatching { repository.replaceTrayIcon(packId, uri, options) }
                .onSuccess { setInfo("Tray icon replaced") }
                .onFailure { setError(it, "Tray icon update failed") }
            refreshWorkspace()
            selectedPackId.value?.let { loadPack(it) }
        }
    }

    fun uploadStickers(packId: String, uris: List<Uri>, options: ImageEditOptions = ImageEditOptions()) {
        if (uris.isEmpty()) return
        viewModelScope.launch {
            setInfo("Uploading ${uris.size} stickers")
            runCatching {
                uris.forEach { uri ->
                    repository.uploadSticker(packId, uri, options)
                }
            }.onSuccess {
                refreshWorkspace()
                selectedPackId.value?.let { loadPack(it) }
                setInfo("${uris.size} stickers uploaded")
            }.onFailure { setError(it, "Batch upload failed") }
        }
    }

    fun refreshWorkspace() {
        if (!isLoggedIn.value) return
        viewModelScope.launch {
            workspaceLoading.value = true
            runCatching {
                val user = repository.currentUser()
                val packs = repository.listPacks()
                val teamList = repository.teams()
                Triple(user, packs, teamList)
            }.onSuccess { (user, packs, teamList) ->
                currentUser.value = user
                account.value = "${user.displayName} <${user.email}>"
                remotePacks.value = packs
                teams.value = teamList
            }.onFailure {
                if (it is HttpException && it.code() == 401) {
                    runCatching { repository.logout() }
                    isLoggedIn.value = false
                    currentUser.value = null
                    remotePacks.value = emptyList()
                    selectedPack.value = null
                    setError(IllegalStateException("Session expired"), "Session expired")
                } else {
                    setError(it, "Could not load workspace")
                }
            }
            workspaceLoading.value = false
        }
    }

    fun loadPublicPacks() {
        viewModelScope.launch {
            runCatching { repository.publicPacks() }
                .onSuccess { publicPacks.value = it }
                .onFailure { setError(it, "Could not load public packs") }
        }
    }

    fun openPack(packId: String) {
        selectedPackId.value = packId
        loadPack(packId)
    }

    fun closePack() {
        selectedPackId.value = null
        selectedPack.value = null
        selectedPackMembers.value = emptyList()
        selectedPackInvites.value = emptyList()
        selectedPackActivity.value = emptyList()
    }

    fun loadPack(packId: String) {
        viewModelScope.launch {
            runCatching { repository.pack(packId) }
                .onSuccess { pack ->
                    selectedPack.value = pack
                    if (pack.canManage == true) {
                        loadPackCollaboration(packId)
                    }
                    loadPackActivity(packId)
                }
                .onFailure { setError(it, "Could not load pack") }
        }
    }

    private fun loadPackCollaboration(packId: String) {
        viewModelScope.launch {
            runCatching {
                repository.packMembers(packId) to repository.packInvites(packId)
            }.onSuccess { (members, invites) ->
                selectedPackMembers.value = members
                selectedPackInvites.value = invites
            }.onFailure { setError(it, "Could not load collaboration") }
        }
    }

    fun loadPackActivity(packId: String, limit: Int? = null) {
        viewModelScope.launch {
            runCatching { repository.packActivity(packId, limit) }
                .onSuccess { selectedPackActivity.value = it }
                .onFailure { setError(it, "Could not load activity") }
        }
    }

    fun createPack(request: CreatePackRequest) {
        viewModelScope.launch {
            runCatching { repository.createPack(request) }
                .onSuccess {
                    setInfo("Pack created")
                    refreshWorkspace()
                    openPack(it.id)
                }
                .onFailure { setError(it, "Pack creation failed") }
        }
    }

    fun updatePack(packId: String, request: UpdatePackRequest) {
        viewModelScope.launch {
            runCatching { repository.updatePack(packId, request) }
                .onSuccess {
                    selectedPack.value = it
                    refreshWorkspace()
                    setInfo("Pack saved")
                }
                .onFailure { setError(it, "Pack update failed") }
        }
    }

    fun clonePack(packId: String) {
        viewModelScope.launch {
            runCatching { repository.clonePack(packId) }
                .onSuccess {
                    refreshWorkspace()
                    openPack(it.id)
                    setInfo("Pack cloned")
                }
                .onFailure { setError(it, "Pack clone failed") }
        }
    }

    fun deletePack(packId: String) {
        viewModelScope.launch {
            runCatching { repository.deletePack(packId) }
                .onSuccess {
                    if (selectedPackId.value == packId) closePack()
                    refreshWorkspace()
                    setInfo("Pack deleted")
                }
                .onFailure { setError(it, "Pack deletion failed") }
        }
    }

    fun updateSticker(packId: String, stickerId: String, request: UpdateStickerRequest) {
        viewModelScope.launch {
            runCatching { repository.updateSticker(packId, stickerId, request) }
                .onSuccess { refreshPackAfterAction(packId, "Sticker updated") }
                .onFailure { setError(it, "Sticker update failed") }
        }
    }

    fun deleteSticker(packId: String, stickerId: String) {
        viewModelScope.launch {
            runCatching { repository.deleteSticker(packId, stickerId) }
                .onSuccess { refreshPackAfterAction(packId, "Sticker deleted") }
                .onFailure { setError(it, "Sticker deletion failed") }
        }
    }

    fun replaceStickerImage(packId: String, stickerId: String, uri: Uri, options: ImageEditOptions) {
        viewModelScope.launch {
            runCatching { repository.replaceStickerImage(packId, stickerId, uri, options) }
                .onSuccess { refreshPackAfterAction(packId, "Sticker image replaced") }
                .onFailure { setError(it, "Sticker image update failed") }
        }
    }

    fun reorderStickers(packId: String, stickerIds: List<String>) {
        viewModelScope.launch {
            runCatching { repository.reorderStickers(packId, stickerIds) }
                .onSuccess { refreshPackAfterAction(packId, "Sticker order saved") }
                .onFailure { setError(it, "Sticker reorder failed") }
        }
    }

    fun copyStickers(packId: String, targetPackId: String, stickerIds: List<String>) {
        viewModelScope.launch {
            runCatching { repository.copyStickers(packId, targetPackId, stickerIds) }
                .onSuccess { refreshPackAfterAction(packId, "Stickers copied") }
                .onFailure { setError(it, "Sticker copy failed") }
        }
    }

    fun moveStickers(packId: String, targetPackId: String, stickerIds: List<String>) {
        viewModelScope.launch {
            runCatching { repository.moveStickers(packId, targetPackId, stickerIds) }
                .onSuccess { refreshPackAfterAction(packId, "Stickers moved") }
                .onFailure { setError(it, "Sticker move failed") }
        }
    }

    fun loadStickerComments(packId: String, stickerId: String) {
        viewModelScope.launch {
            runCatching { repository.stickerComments(packId, stickerId) }
                .onSuccess { selectedStickerComments.value = it }
                .onFailure { setError(it, "Could not load comments") }
        }
    }

    fun createStickerComment(packId: String, stickerId: String, body: String) {
        viewModelScope.launch {
            runCatching { repository.createStickerComment(packId, stickerId, body) }
                .onSuccess { loadStickerComments(packId, stickerId); setInfo("Comment added") }
                .onFailure { setError(it, "Comment failed") }
        }
    }

    fun deleteStickerComment(packId: String, stickerId: String, commentId: String) {
        viewModelScope.launch {
            runCatching { repository.deleteStickerComment(packId, stickerId, commentId) }
                .onSuccess { loadStickerComments(packId, stickerId); setInfo("Comment deleted") }
                .onFailure { setError(it, "Comment deletion failed") }
        }
    }

    fun inviteMember(packId: String, role: String, email: String?, expiresAt: String?) {
        viewModelScope.launch {
            runCatching { repository.createPackInvite(packId, role, email, expiresAt) }
                .onSuccess { loadPackCollaboration(packId); setInfo("Invite created") }
                .onFailure { setError(it, "Invite failed") }
        }
    }

    fun revokeInvite(packId: String, inviteId: String) {
        viewModelScope.launch {
            runCatching { repository.revokePackInvite(packId, inviteId) }
                .onSuccess { loadPackCollaboration(packId); setInfo("Invite revoked") }
                .onFailure { setError(it, "Invite revocation failed") }
        }
    }

    fun updateMember(packId: String, memberId: String, role: String) {
        viewModelScope.launch {
            runCatching { repository.updatePackMember(packId, memberId, role) }
                .onSuccess { loadPackCollaboration(packId); setInfo("Member role updated") }
                .onFailure { setError(it, "Member update failed") }
        }
    }

    fun removeMember(packId: String, memberId: String) {
        viewModelScope.launch {
            runCatching { repository.removePackMember(packId, memberId) }
                .onSuccess { loadPackCollaboration(packId); setInfo("Member removed") }
                .onFailure { setError(it, "Member removal failed") }
        }
    }

    fun createTeam(request: CreateTeamRequest) {
        viewModelScope.launch {
            runCatching { repository.createTeam(request) }
                .onSuccess { refreshWorkspace(); setInfo("Team created") }
                .onFailure { setError(it, "Team creation failed") }
        }
    }

    fun loadTeamMembers(teamId: String) {
        viewModelScope.launch {
            runCatching { repository.teamMembers(teamId) }
                .onSuccess { teamMembers.value = it }
                .onFailure { setError(it, "Could not load team members") }
        }
    }

    fun addTeamMember(teamId: String, email: String, role: String) {
        viewModelScope.launch {
            runCatching { repository.addTeamMember(teamId, AddTeamMemberRequest(email, role)) }
                .onSuccess { loadTeamMembers(teamId); refreshWorkspace(); setInfo("Team member added") }
                .onFailure { setError(it, "Could not add team member") }
        }
    }

    fun updateTeamMember(teamId: String, memberId: String, role: String) {
        viewModelScope.launch {
            runCatching { repository.updateTeamMember(teamId, memberId, role) }
                .onSuccess { loadTeamMembers(teamId); setInfo("Team member role updated") }
                .onFailure { setError(it, "Could not update team member") }
        }
    }

    fun removeTeamMember(teamId: String, memberId: String) {
        viewModelScope.launch {
            runCatching { repository.removeTeamMember(teamId, memberId) }
                .onSuccess { loadTeamMembers(teamId); refreshWorkspace(); setInfo("Team member removed") }
                .onFailure { setError(it, "Could not remove team member") }
        }
    }

    fun acceptInvite(code: String) {
        viewModelScope.launch {
            runCatching { repository.acceptPackInvite(code) }
                .onSuccess { refreshWorkspace(); setInfo("Invite accepted") }
                .onFailure { setError(it, "Could not accept invite") }
        }
    }

    fun changePassword(currentPassword: String, newPassword: String) {
        viewModelScope.launch {
            runCatching { repository.changePassword(currentPassword, newPassword) }
                .onSuccess { setInfo("Password changed") }
                .onFailure { setError(it, "Password change failed") }
        }
    }

    fun loadSessions() {
        viewModelScope.launch {
            runCatching { repository.sessions() }
                .onSuccess { sessions.value = it }
                .onFailure { setError(it, "Could not load sessions") }
        }
    }

    fun revokeSession(sessionId: String) {
        viewModelScope.launch {
            runCatching { repository.revokeSession(sessionId) }
                .onSuccess { loadSessions(); setInfo("Session revoked") }
                .onFailure { setError(it, "Session revocation failed") }
        }
    }

    fun revokeAllSessions() {
        viewModelScope.launch {
            runCatching { repository.revokeAllSessions() }
                .onSuccess { loadSessions(); setInfo("Sessions revoked") }
                .onFailure { setError(it, "Session revocation failed") }
        }
    }

    fun loadAdminSettings() {
        viewModelScope.launch {
            runCatching { repository.adminSettings() }
                .onSuccess { adminSettings.value = it }
                .onFailure { setError(it, "Could not load admin settings") }
        }
    }

    fun updateAdminSettings(request: UpdateAdminSettingsRequest) {
        viewModelScope.launch {
            runCatching { repository.updateAdminSettings(request) }
                .onSuccess { adminSettings.value = it; setInfo("Admin settings saved") }
                .onFailure { setError(it, "Admin settings update failed") }
        }
    }

    fun loadAdminAuditLog(limit: Int? = 100) {
        viewModelScope.launch {
            runCatching { repository.adminAuditLog(limit) }
                .onSuccess { adminAuditLog.value = it }
                .onFailure { setError(it, "Could not load audit log") }
        }
    }

    fun cleanupAdminAuditLog() {
        viewModelScope.launch {
            runCatching { repository.cleanupAuditLog() }
                .onSuccess { loadAdminAuditLog(); setInfo("Audit log cleaned") }
                .onFailure { setError(it, "Audit cleanup failed") }
        }
    }

    fun exportAdminAuditLog() {
        viewModelScope.launch {
            runCatching { repository.exportAuditLogFile() }
                .onSuccess { _exportEvents.emit(it); setInfo("Audit export ready to share") }
                .onFailure { setError(it, "Audit export failed") }
        }
    }

    private fun refreshPackAfterAction(packId: String, message: String) {
        loadPack(packId)
        refreshWorkspace()
        setInfo(message)
    }

    fun exportPack(packId: String) {
        viewModelScope.launch {
            setInfo("Queuing export")
            runCatching { repository.queueExport(packId) }
                .onSuccess { job ->
                    jobPackIds[job.id] = packId
                    jobIsExport[job.id] = true
                    activeJobs.value = (activeJobs.value + job).distinctBy { it.id }
                    watchJob(job.id, packId, true)
                }
                .onFailure { setError(it, "Export failed") }
        }
    }

    fun cancelJob(jobId: String) {
        viewModelScope.launch {
            runCatching { repository.cancelJob(jobId) }
                .onSuccess { updateJob(it); setInfo("Job cancelled") }
                .onFailure { setError(it, "Could not cancel job") }
        }
    }

    fun retryJob(jobId: String) {
        viewModelScope.launch {
            val packId = jobPackIds[jobId] ?: return@launch
            runCatching { repository.retryJob(jobId) }
                .onSuccess { retriedJob ->
                    val isExport = jobIsExport[jobId] == true
                    jobPackIds[retriedJob.id] = packId
                    jobIsExport[retriedJob.id] = isExport
                    updateJob(retriedJob)
                    watchJob(retriedJob.id, packId, isExport)
                    setInfo("Job retried")
                }
                .onFailure { setError(it, "Could not retry job") }
        }
    }

    private fun watchJob(jobId: String, packId: String, isExport: Boolean) {
        viewModelScope.launch {
            try {
                var job = repository.job(jobId)
                updateJob(job)
                while (job.status == "QUEUED" || job.status == "RUNNING" || job.status == "PENDING") {
                    delay(700)
                    job = repository.job(jobId)
                    updateJob(job)
                }
                when (job.status) {
                    "COMPLETED" -> {
                        if (isExport) _exportEvents.emit(repository.downloadExport(packId)) else repository.syncPack(packId)
                        refreshWorkspace()
                        selectedPackId.value?.let { loadPack(it) }
                        setInfo(if (isExport) "Export ready to share" else "Sticker upload complete")
                    }
                    "FAILED", "CANCELLED" -> setError(IllegalStateException(job.error ?: job.status), "Job failed")
                }
            } catch (error: Throwable) {
                setError(error, "Could not track job")
            }
        }
    }

    private fun updateJob(job: JobDto) {
        activeJobs.value = (activeJobs.value.filterNot { it.id == job.id } + job)
            .takeLast(20)
    }

    private fun setInfo(message: String) {
        status.value = AppStatus(message)
    }

    private fun setError(error: Throwable, fallback: String) {
        if (error is HttpException && error.code() == 401 && isLoggedIn.value) {
            viewModelScope.launch {
                runCatching { repository.logout() }
                isLoggedIn.value = false
                currentUser.value = null
                remotePacks.value = emptyList()
                selectedPack.value = null
            }
        }
        status.value = AppStatus(friendlyError(error, fallback), isError = true)
    }

    private fun friendlyError(error: Throwable, fallback: String): String = when (error) {
        is IllegalArgumentException -> error.message ?: fallback
        is UnknownHostException -> "Could not find that server. Check the URL or DNS."
        is ConnectException -> "Could not reach the server. Check that Sticker Foundry is running and the URL is correct."
        is UnknownServiceException -> "HTTP is blocked by Android for this URL. Use HTTPS or allow local HTTP in the app build."
        is SocketTimeoutException -> "The server took too long to respond. Try again or check your network."
        is SSLHandshakeException -> "Secure connection failed. Check the HTTPS certificate or use HTTP for local testing."
        is HttpException -> httpErrorMessage(error, fallback)
        is IOException -> "Network error. Check Wi-Fi, VPN, firewall, and the server URL."
        else -> error.message?.takeIf { it.isNotBlank() } ?: fallback
    }

    private fun httpErrorMessage(error: HttpException, fallback: String): String = when (error.code()) {
        400 -> "The server rejected the request. Check the selected image or settings."
        401 -> "Session expired. Log in again."
        403 -> "This account does not have permission for that action."
        404 -> "The server endpoint was not found. Check that the URL includes /api/."
        in 500..599 -> "Sticker Foundry server error (${error.code()}). Check the backend logs."
        else -> "$fallback (${error.code()})"
    }

    companion object {
        private fun formatBytes(bytes: Long): String {
            if (bytes < 1024) return "$bytes B"
            val units = listOf("KB", "MB", "GB")
            var value = bytes / 1024.0
            var unitIndex = 0
            while (value >= 1024 && unitIndex < units.lastIndex) {
                value /= 1024
                unitIndex += 1
            }
            return String.format(Locale.US, "%.1f %s", value, units[unitIndex])
        }

        fun factory(context: Context): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return StickerViewModel(StickerRepository.get(context)) as T
                }
            }
    }
}
