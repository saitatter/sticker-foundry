package com.stickerfoundry.app.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
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

    fun cacheSizeBytes(): Long = packsDirectory().sizeBytes()

    fun saveServerUrl(url: String) {
        session.saveServerUrl(url)
        apiBaseUrl = ""
        apiClient = null
    }

    suspend fun login(email: String, password: String) {
        val response = api().login(LoginRequest(email, password))
        session.saveTokens(response.accessToken, response.refreshToken)
        session.saveAccount(response.user.email, response.user.displayName)
    }

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
        mutatePackWithConflictSync(packId) { bearer, version ->
            api().uploadSticker(bearer, packId, version, multipartFromUri(uri, options), stickerUploadOptionParts(options)).close()
        }
    }

    suspend fun replaceTrayIcon(packId: String, uri: Uri, options: ImageEditOptions) = withContext(Dispatchers.IO) {
        mutatePackWithConflictSync(packId) { bearer, version ->
            api().replaceTrayIcon(bearer, packId, version, multipartFromUri(uri, options)).close()
        }
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
    }

    suspend fun clearPackCache(packId: String) = withContext(Dispatchers.IO) {
        deleteLocalPack(packId)
    }

    private suspend fun deleteLocalPack(packId: String) {
        db.stickerDao().deletePack(packId)
        File(packsDirectory(), packId).deleteRecursively()
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
