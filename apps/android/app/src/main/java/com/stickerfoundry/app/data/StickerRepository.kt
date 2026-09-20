package com.stickerfoundry.app.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import com.stickerfoundry.app.whatsapp.StickerContentProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.io.ByteArrayOutputStream
import java.io.File

class StickerRepository private constructor(context: Context) {
    private val appContext = context.applicationContext
    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
    private val db = LocalDatabase.get(appContext)
    private val session = SessionStore(appContext)
    private val extractor = ZipExtractor(appContext, moshi)
    private val client = OkHttpClient.Builder().build()
    private var apiBaseUrl = ""
    private var apiClient: StickerApi? = null

    fun observePacks(): Flow<List<PackEntity>> = db.stickerDao().observePacks()

    fun observeStickers(): Flow<List<StickerEntity>> = db.stickerDao().observeStickers()

    fun serverUrl(): String = session.serverUrl()

    fun accountLabel(): String = session.accountLabel()

    fun isLoggedIn(): Boolean = session.isLoggedIn()

    fun darkTheme(): Boolean = session.darkTheme()

    fun cacheSizeBytes(): Long = packsDirectory().sizeBytes()

    fun saveServerUrl(url: String) {
        session.saveServerUrl(url)
        apiBaseUrl = ""
        apiClient = null
    }

    fun saveDarkTheme(enabled: Boolean) {
        session.saveDarkTheme(enabled)
    }

    suspend fun checkServerUrl(url: String): HealthResponse = withContext(Dispatchers.IO) {
        val normalizedUrl = session.normalizedServerUrl(url)
        Retrofit.Builder()
            .baseUrl(normalizedUrl)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .client(client)
            .build()
            .create(StickerApi::class.java)
            .health()
    }

    suspend fun login(email: String, password: String) {
        val response = api().login(LoginRequest(email, password))
        session.saveTokens(response.accessToken, response.refreshToken)
        session.saveAccount(response.user.email, response.user.displayName)
    }

    suspend fun register(email: String, displayName: String, password: String, inviteCode: String?) {
        val response = api().register(RegisterRequest(email, displayName, password, inviteCode?.trim()?.ifBlank { null }))
        session.saveTokens(response.accessToken, response.refreshToken)
        session.saveAccount(response.user.email, response.user.displayName)
    }

    suspend fun currentUser(): UserDto = withAuthRetry { bearer -> api().me(bearer) }

    suspend fun listPacks(): List<PackDto> = withAuthRetry { bearer -> api().packs(bearer) }

    suspend fun publicPacks(): List<PackDto> = api().publicPacks()

    suspend fun pack(packId: String): PackDetailDto = withAuthRetry { bearer -> api().pack(bearer, packId) }

    suspend fun createPack(request: CreatePackRequest): PackDetailDto =
        withAuthRetry { bearer -> api().createPack(bearer, request) }

    suspend fun updatePack(packId: String, request: UpdatePackRequest): PackDetailDto =
        withAuthRetry { bearer -> api().updatePack(bearer, packId, request) }

    suspend fun deletePack(packId: String) {
        withAuthRetry { bearer -> api().deletePack(bearer, packId).close() }
        db.stickerDao().deletePack(packId)
        File(packsDirectory(), packId).deleteRecursively()
    }

    suspend fun clonePack(packId: String): PackDetailDto =
        withAuthRetry { bearer -> api().clonePack(bearer, packId) }

    suspend fun packMembers(packId: String): List<PackMemberDto> =
        withAuthRetry { bearer -> api().packMembers(bearer, packId) }

    suspend fun updatePackMember(packId: String, memberId: String, role: String): PackMemberDto =
        withAuthRetry { bearer -> api().updatePackMember(bearer, packId, memberId, RoleRequest(role)) }

    suspend fun removePackMember(packId: String, memberId: String) {
        withAuthRetry { bearer -> api().removePackMember(bearer, packId, memberId).close() }
    }

    suspend fun packInvites(packId: String): List<PackInviteDto> =
        withAuthRetry { bearer -> api().packInvites(bearer, packId) }

    suspend fun createPackInvite(packId: String, role: String, email: String?, expiresAt: String?): PackInviteDto =
        withAuthRetry { bearer -> api().createPackInvite(bearer, packId, CreateInviteRequest(role, email?.trim()?.ifBlank { null }, expiresAt)) }

    suspend fun revokePackInvite(packId: String, inviteId: String) {
        withAuthRetry { bearer -> api().revokePackInvite(bearer, packId, inviteId).close() }
    }

    suspend fun acceptPackInvite(code: String): PackDetailDto =
        withAuthRetry { bearer -> api().acceptPackInvite(bearer, code.trim()) }

    suspend fun packActivity(packId: String, limit: Int? = null): List<AuditLogEntryDto> =
        withAuthRetry { bearer -> api().packActivity(bearer, packId, limit) }

    suspend fun updateSticker(packId: String, stickerId: String, request: UpdateStickerRequest): StickerDto =
        withAuthRetry { bearer -> api().updateSticker(bearer, packId, stickerId, request) }

    suspend fun deleteSticker(packId: String, stickerId: String) {
        withAuthRetry { bearer -> api().deleteSticker(bearer, packId, stickerId).close() }
    }

    suspend fun replaceStickerImage(packId: String, stickerId: String, uri: Uri, options: ImageEditOptions): StickerDto {
        val version = pack(packId).imageDataVersion
        return withAuthRetry { bearer ->
            api().replaceStickerImage(
                bearer,
                packId,
                stickerId,
                version,
                multipartFromUri(uri, options),
                stickerUploadOptionParts(options),
            )
        }
    }

    suspend fun reorderStickers(packId: String, stickerIds: List<String>): PackDetailDto =
        withAuthRetry { bearer -> api().reorderStickers(bearer, packId, ReorderStickersRequest(stickerIds)) }

    suspend fun copyStickers(packId: String, targetPackId: String, stickerIds: List<String>): PackDetailDto =
        withAuthRetry { bearer -> api().copyStickers(bearer, packId, TransferStickersRequest(targetPackId, stickerIds)) }

    suspend fun moveStickers(packId: String, targetPackId: String, stickerIds: List<String>): PackDetailDto =
        withAuthRetry { bearer -> api().moveStickers(bearer, packId, TransferStickersRequest(targetPackId, stickerIds)) }

    suspend fun stickerComments(packId: String, stickerId: String): List<StickerCommentDto> =
        withAuthRetry { bearer -> api().stickerComments(bearer, packId, stickerId) }

    suspend fun createStickerComment(packId: String, stickerId: String, body: String): StickerCommentDto =
        withAuthRetry { bearer -> api().createStickerComment(bearer, packId, stickerId, CreateCommentRequest(body.trim())) }

    suspend fun deleteStickerComment(packId: String, stickerId: String, commentId: String) {
        withAuthRetry { bearer -> api().deleteStickerComment(bearer, packId, stickerId, commentId).close() }
    }

    suspend fun teams(): List<TeamDto> = withAuthRetry { bearer -> api().teams(bearer) }

    suspend fun createTeam(request: CreateTeamRequest): TeamDto =
        withAuthRetry { bearer -> api().createTeam(bearer, request) }

    suspend fun teamMembers(teamId: String): List<TeamMemberDto> =
        withAuthRetry { bearer -> api().teamMembers(bearer, teamId) }

    suspend fun addTeamMember(teamId: String, request: AddTeamMemberRequest): TeamMemberDto =
        withAuthRetry { bearer -> api().addTeamMember(bearer, teamId, request) }

    suspend fun updateTeamMember(teamId: String, memberId: String, role: String): TeamMemberDto =
        withAuthRetry { bearer -> api().updateTeamMember(bearer, teamId, memberId, RoleRequest(role)) }

    suspend fun removeTeamMember(teamId: String, memberId: String) {
        withAuthRetry { bearer -> api().removeTeamMember(bearer, teamId, memberId).close() }
    }

    suspend fun sessions(): List<UserSessionDto> = withAuthRetry { bearer -> api().sessions(bearer) }

    suspend fun revokeSession(sessionId: String) {
        withAuthRetry { bearer -> api().revokeSession(bearer, sessionId).close() }
    }

    suspend fun revokeAllSessions() {
        withAuthRetry { bearer -> api().revokeAllSessions(bearer).close() }
    }

    suspend fun changePassword(currentPassword: String, newPassword: String) {
        withAuthRetry { bearer -> api().changePassword(bearer, ChangePasswordRequest(currentPassword, newPassword)).close() }
    }

    suspend fun requestPasswordReset(email: String) {
        api().requestPasswordReset(PasswordResetRequest(email.trim())).close()
    }

    suspend fun resetPassword(token: String, newPassword: String) {
        api().resetPassword(PasswordResetConfirmRequest(token.trim(), newPassword)).close()
    }

    suspend fun adminSettings(): AdminSettingsDto = withAuthRetry { bearer -> api().adminSettings(bearer) }

    suspend fun updateAdminSettings(request: UpdateAdminSettingsRequest): AdminSettingsDto =
        withAuthRetry { bearer -> api().updateAdminSettings(bearer, request) }

    suspend fun adminAuditLog(limit: Int? = null): List<AuditLogEntryDto> =
        withAuthRetry { bearer -> api().adminAuditLog(bearer, limit) }

    suspend fun cleanupAuditLog() {
        withAuthRetry { bearer -> api().cleanupAuditLog(bearer).close() }
    }

    suspend fun exportAuditLog(limit: Int? = null): ByteArray = withAuthRetry { bearer ->
        api().exportAuditLog(bearer, limit).use { it.bytes() }
    }

    suspend fun exportAuditLogFile(limit: Int? = null): File = withContext(Dispatchers.IO) {
        val exportDir = File(appContext.filesDir, "exports").apply { mkdirs() }
        val file = File(exportDir, "stickerfoundry-audit-${System.currentTimeMillis()}.csv")
        file.writeBytes(exportAuditLog(limit))
        file
    }

    suspend fun exportContents(packId: String): String = withAuthRetry { bearer ->
        api().exportContents(bearer, packId).use { it.string() }
    }

    suspend fun job(jobId: String): JobDto = withAuthRetry { bearer -> api().job(bearer, jobId) }

    suspend fun cancelJob(jobId: String): JobDto = withAuthRetry { bearer -> api().cancelJob(bearer, jobId) }

    suspend fun retryJob(jobId: String): JobDto = withAuthRetry { bearer -> api().retryJob(bearer, jobId) }

    suspend fun sync() = withContext(Dispatchers.IO) {
        val remotePacks = withAuthRetry { bearer -> api().syncPacks(bearer).packs }
        val remotePackIds = remotePacks.map { it.id }.toSet()

        for (local in db.stickerDao().getAllPacksBlocking()) {
            if (local.id !in remotePackIds) {
                deleteLocalPack(local.id)
            }
        }

        for (remote in remotePacks) {
            if (!remote.canExport) {
                deleteLocalPack(remote.id)
                continue
            }
            val remoteSyncKey = remote.contentHash ?: remote.syncHash
            val local = db.stickerDao().getPack(remote.id)
            if (local?.syncHash == remoteSyncKey) {
                updateCachedPackMetadata(local, remote)
                continue
            }

            downloadAndCache(remote)
        }
    }

    suspend fun syncPack(packId: String) = withContext(Dispatchers.IO) {
        val remote = withAuthRetry { bearer -> api().syncPacks(bearer).packs }.firstOrNull { it.id == packId }
            ?: run {
                deleteLocalPack(packId)
                error("Pack is no longer available on the server")
            }
        if (!remote.canExport) {
            deleteLocalPack(packId)
            error("Pack is not exportable yet")
        }

        downloadAndCache(remote)
    }

    suspend fun uploadSticker(packId: String, uri: Uri, options: ImageEditOptions) = withContext(Dispatchers.IO) {
        val job = queueStickerUpload(packId, uri, options)
        awaitJob(job.id)
    }

    suspend fun queueStickerUpload(packId: String, uri: Uri, options: ImageEditOptions): JobDto = withContext(Dispatchers.IO) {
        val version = db.stickerDao().getPack(packId)?.imageDataVersion ?: error("Sync this pack before uploading")
        try {
            withAuthRetry { bearer ->
                api().queueStickerUpload(
                    bearer,
                    packId,
                    version,
                    multipartFromUri(uri, options),
                    stickerUploadOptionParts(options),
                )
            }
        } catch (error: HttpException) {
            if (error.code() == 409) {
                runCatching { syncPack(packId) }
                error("Pack changed on the server. Synced the latest version; retry the upload.")
            }
            throw error
        }
    }

    suspend fun exportPack(packId: String): File = withContext(Dispatchers.IO) {
        val job = queueExport(packId)
        awaitJob(job.id)
        downloadExportToFile(packId)
    }

    suspend fun queueExport(packId: String): JobDto = withAuthRetry { bearer -> api().queueExport(bearer, packId) }

    suspend fun downloadExport(packId: String): File = withContext(Dispatchers.IO) {
        downloadExportToFile(packId)
    }

    suspend fun replaceTrayIcon(packId: String, uri: Uri, options: ImageEditOptions) = withContext(Dispatchers.IO) {
        mutatePackWithConflictSync(packId) { bearer, version ->
            api().replaceTrayIcon(bearer, packId, version, multipartFromUri(uri, options)).close()
        }
        // The server response only confirms the upload. Refresh the local export as well so
        // the app preview and WhatsApp's content provider see the new tray icon immediately.
        syncPack(packId)
        notifyPackChanged(packId)
    }

    suspend fun logout() = withContext(Dispatchers.IO) {
        session.refreshToken()?.let { token ->
            runCatching { api().logout(RefreshTokenRequest(token)).close() }
        }
        session.clearToken()
    }

    suspend fun clearCache() = withContext(Dispatchers.IO) {
        db.stickerDao().deleteAllPacks()
        packsDirectory().deleteRecursively()
        File(appContext.filesDir, "exports").deleteRecursively()
    }

    suspend fun clearPackCache(packId: String) = withContext(Dispatchers.IO) {
        deleteLocalPack(packId)
    }

    private suspend fun deleteLocalPack(packId: String) {
        db.stickerDao().deletePack(packId)
        File(packsDirectory(), packId).deleteRecursively()
    }

    private fun notifyPackChanged(packId: String) {
        val resolver = appContext.contentResolver
        resolver.notifyChange(StickerContentProvider.metadataUri(), null)
        resolver.notifyChange(StickerContentProvider.metadataUri(packId), null)
        resolver.notifyChange(StickerContentProvider.stickersUri(packId), null)
    }

    private suspend fun updateCachedPackMetadata(local: PackEntity, remote: SyncPackDto) {
        db.stickerDao().upsertPack(
            local.copy(
                name = remote.name,
                publisher = remote.publisher,
                imageDataVersion = remote.imageDataVersion,
                isPublic = remote.isPublic,
                isAnimated = remote.isAnimated,
                isOwner = remote.isOwner,
                teamId = remote.teamId,
                teamName = remote.teamName,
                role = remote.role ?: if (remote.isOwner) "OWNER" else "VIEWER",
                canEdit = remote.canEdit ?: remote.isOwner,
                canManage = remote.canManage ?: remote.isOwner,
                stickerCount = remote.stickerCount,
                updatedAt = remote.updatedAt,
                extractionStatus = EXTRACTION_READY,
                extractionError = null,
            ),
        )
    }

    private suspend fun downloadAndCache(remote: SyncPackDto) {
        val local = db.stickerDao().getPack(remote.id)
        val manifestLookup = fetchManifest(remote.id, local?.syncHash)
        val manifest = manifestLookup.manifest
        val remoteSyncKey = manifest?.contentHash ?: remote.contentHash ?: remote.syncHash
        if (manifestLookup.notModified && local != null) {
            updateCachedPackMetadata(local, remote)
            return
        }
        if (local?.syncHash == remoteSyncKey) {
            updateCachedPackMetadata(local, remote)
            return
        }
        if (manifest?.canExport == false) {
            deleteLocalPack(remote.id)
            error("Pack is not exportable yet")
        }

        markExtractionStatus(remote.id, EXTRACTION_SYNCING, null)
        val extracted = try {
            val zipFile = downloadZipToTemp(remote.id)
            try {
                extractor.extract(remote.id, zipFile)
            } finally {
                zipFile.delete()
            }
        } catch (error: Throwable) {
            markExtractionStatus(remote.id, EXTRACTION_FAILED, error.message ?: error::class.java.simpleName)
            throw error
        }
        db.stickerDao().upsertPack(
            extracted.entity.copy(
                isPublic = remote.isPublic,
                isAnimated = remote.isAnimated,
                isOwner = remote.isOwner,
                teamId = remote.teamId,
                teamName = remote.teamName,
                role = remote.role ?: if (remote.isOwner) "OWNER" else "VIEWER",
                canEdit = remote.canEdit ?: remote.isOwner,
                canManage = remote.canManage ?: remote.isOwner,
                stickerCount = manifest?.stickerCount ?: remote.stickerCount,
                syncHash = remoteSyncKey,
                updatedAt = remote.updatedAt,
                extractionStatus = EXTRACTION_READY,
                extractionError = null,
            ),
        )
        db.stickerDao().deleteStickers(extracted.entity.id)
        db.stickerDao().upsertStickers(extracted.stickers)
    }

    private suspend fun fetchManifest(packId: String, localSyncHash: String?): ManifestLookup {
        val ifNoneMatch = localSyncHash?.takeIf { it.isNotBlank() }?.let { "\"$it\"" }
        val response = withAuthRetry { bearer -> api().packManifest(bearer, packId, ifNoneMatch) }
        if (response.code() == 304) {
            return ManifestLookup(notModified = true, manifest = null)
        }
        if (!response.isSuccessful) {
            throw HttpException(response)
        }
        return ManifestLookup(notModified = false, manifest = response.body() ?: error("Manifest response was empty"))
    }

    private suspend fun mutatePackWithConflictSync(packId: String, block: suspend (String, String) -> Unit) {
        val localVersion = db.stickerDao().getPack(packId)?.imageDataVersion ?: error("Sync this pack before editing")
        try {
            withAuthRetry { bearer -> block(bearer, localVersion) }
            sync()
        } catch (error: HttpException) {
            if (error.code() == 409) {
                runCatching { syncPack(packId) }
                error("Pack changed on the server. Synced the latest version; retry your edit.")
            }
            throw error
        }
    }

    private suspend fun downloadZipToTemp(packId: String): File {
        val downloadDir = File(appContext.cacheDir, "downloads").apply { mkdirs() }
        val zipFile = File(downloadDir, "$packId-${System.currentTimeMillis()}.zip.tmp")
        return downloadExportToFile(packId, zipFile)
    }

    private suspend fun downloadExportToFile(packId: String): File {
        val exportDir = File(appContext.filesDir, "exports").apply { mkdirs() }
        return downloadExportToFile(packId, File(exportDir, "$packId-${System.currentTimeMillis()}.zip"))
    }

    private suspend fun downloadExportToFile(packId: String, zipFile: File): File {
        try {
            withAuthRetry { bearer ->
                api().exportPack(bearer, packId).use { body ->
                    body.byteStream().use { input ->
                        zipFile.outputStream().use { output -> input.copyTo(output) }
                    }
                }
            }
            return zipFile
        } catch (error: Throwable) {
            zipFile.delete()
            throw error
        }
    }

    private suspend fun markExtractionStatus(packId: String, status: String, error: String?) {
        db.stickerDao().updateExtractionStatus(packId, status, error)
    }

    private fun api(): StickerApi {
        val currentUrl = session.serverUrl()
        if (apiClient != null && apiBaseUrl == currentUrl) {
            return apiClient ?: error("API client unavailable")
        }

        apiBaseUrl = currentUrl
        apiClient = Retrofit.Builder()
            .baseUrl(currentUrl)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .client(client)
            .build()
            .create(StickerApi::class.java)
        return apiClient ?: error("API client unavailable")
    }

    private fun bearerToken(): String {
        val token = session.token() ?: error("Login first")
        return "Bearer $token"
    }

    private suspend fun <T> withAuthRetry(block: suspend (String) -> T): T {
        return try {
            block(bearerToken())
        } catch (error: HttpException) {
            if (error.code() != 401) throw error
            block(refreshAccessToken())
        }
    }

    private suspend fun refreshAccessToken(): String {
        val refreshToken = session.refreshToken() ?: error("Login first")
        val response = api().refresh(RefreshTokenRequest(refreshToken))
        session.saveTokens(response.accessToken, response.refreshToken)
        return "Bearer ${response.accessToken}"
    }

    private suspend fun awaitJob(jobId: String): JobDto = withTimeout(JOB_TIMEOUT_MS) {
        var completedJob: JobDto? = null
        while (completedJob == null) {
            val job = withAuthRetry { bearer -> api().job(bearer, jobId) }
            when (job.status) {
                "COMPLETED" -> completedJob = job
                "FAILED", "CANCELLED" -> throw IllegalStateException(job.error ?: "Server job ${job.status.lowercase()}")
                else -> delay(JOB_POLL_MS)
            }
        }
        completedJob ?: error("Server job did not complete")
    }

    private fun multipartFromUri(uri: Uri, options: ImageEditOptions): MultipartBody.Part {
        val resolver = appContext.contentResolver
        val hasEdits = options.hasEdits()
        val mediaType = if (hasEdits) "image/png" else resolver.getType(uri) ?: "image/*"
        val fileName = if (hasEdits) {
            "sticker-foundry-edited-${System.currentTimeMillis()}.png"
        } else {
            displayName(uri) ?: "sticker-foundry-${System.currentTimeMillis()}.png"
        }
        val bytes = if (hasEdits) {
            editedImageBytes(uri, options)
        } else {
            resolver.openInputStream(uri)?.use { it.readBytes() } ?: error("Cannot read selected image")
        }
        val requestBody = bytes.toRequestBody(mediaType.toMediaTypeOrNull())
        return MultipartBody.Part.createFormData("file", fileName, requestBody)
    }

    private fun editedImageBytes(uri: Uri, options: ImageEditOptions): ByteArray {
        val source = appContext.contentResolver.openInputStream(uri)?.use { input ->
            BitmapFactory.decodeStream(input)
        } ?: error("Cannot decode selected image")
        val output = ImageEditRenderer.render(source, options)

        return ByteArrayOutputStream().use { stream ->
            output.compress(Bitmap.CompressFormat.PNG, 100, stream)
            stream.toByteArray()
        }
    }

    private fun stickerUploadOptionParts(options: ImageEditOptions): List<MultipartBody.Part> {
        val parts = mutableListOf<MultipartBody.Part>()

        if (options.emojis.isNotEmpty()) parts += formPart("emojis", options.emojis.joinToString(","))
        if (options.accessibilityText.isNotBlank()) parts += formPart("accessibilityText", options.accessibilityText.trim())

        if (options.backgroundRemovalMode != BackgroundRemovalMode.None) {
            parts += formPart("backgroundRemovalMode", options.backgroundRemovalMode.wireValue)
            parts += formPart("backgroundRemovalThreshold", options.backgroundRemovalThreshold.toInt().coerceIn(180, 255).toString())
            parts += formPart("backgroundRemovalFeather", options.backgroundRemovalFeather.toInt().coerceIn(0, 48).toString())
            parts += formPart("backgroundRemovalCleanupSpeckles", options.backgroundRemovalCleanupSpeckles.toString())
            parts += formPart("backgroundRemovalSpeckleSize", options.backgroundRemovalSpeckleSize.toInt().coerceIn(4, 180).toString())
        }

        val trimStart = options.animatedTrimStart
        val trimEnd = options.animatedTrimEnd
        if (trimStart != null && trimEnd != null) {
            val safeEnd = trimEnd.coerceIn(0.1f, 10f)
            val safeStart = trimStart.coerceIn(0f, safeEnd - 0.1f)
            parts += formPart("animatedTrimStart", safeStart.toString())
            parts += formPart("animatedTrimEnd", safeEnd.toString())
        }
        options.animatedFrameRate?.let { parts += formPart("animatedFrameRate", it.toInt().coerceIn(1, 30).toString()) }
        options.animatedQuality?.let { parts += formPart("animatedQuality", it.toInt().coerceIn(35, 95).toString()) }

        return parts
    }

    private fun formPart(name: String, value: String): MultipartBody.Part =
        MultipartBody.Part.createFormData(name, value)

    private fun displayName(uri: Uri): String? =
        appContext.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
        }

    private fun packsDirectory(): File = File(appContext.filesDir, "packs")

    private fun File.sizeBytes(): Long {
        if (!exists()) return 0L
        if (isFile) return length()
        return listFiles()?.sumOf { it.sizeBytes() } ?: 0L
    }

    companion object {
        private const val JOB_POLL_MS = 750L
        private const val JOB_TIMEOUT_MS = 10 * 60 * 1_000L
        @Volatile private var instance: StickerRepository? = null

        fun get(context: Context): StickerRepository =
            instance ?: synchronized(this) {
                instance ?: StickerRepository(context).also { instance = it }
            }
    }
}

private data class ManifestLookup(
    val notModified: Boolean,
    val manifest: PackManifestDto?,
)
