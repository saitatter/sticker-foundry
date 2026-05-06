package com.example.stickerplatform.data

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.example.stickerplatform.BuildConfig
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory

class StickerRepository private constructor(context: Context) {
    private val appContext = context.applicationContext
    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
    private val api = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .client(OkHttpClient.Builder().build())
        .build()
        .create(StickerApi::class.java)
    private val db = LocalDatabase.get(appContext)
    private val session = SessionStore(appContext)
    private val extractor = ZipExtractor(appContext, moshi)

    fun observePacks(): Flow<List<PackEntity>> = db.stickerDao().observePacks()

    suspend fun login(email: String, password: String) {
        val response = api.login(LoginRequest(email, password))
        session.saveToken(response.accessToken)
    }

    suspend fun sync() = withContext(Dispatchers.IO) {
        val token = session.token() ?: error("Login first")
        val bearer = "Bearer $token"
        val remotePacks = api.syncPacks(bearer).packs

        for (remote in remotePacks) {
            if (!remote.canExport) {
                continue
            }
            val local = db.stickerDao().getPack(remote.id)
            if (local?.syncHash == remote.syncHash) {
                db.stickerDao().upsertPack(
                    local.copy(
                        name = remote.name,
                        publisher = remote.publisher,
                        imageDataVersion = remote.imageDataVersion,
                        isPublic = remote.isPublic,
                        isOwner = remote.isOwner,
                        updatedAt = remote.updatedAt,
                    ),
                )
                continue
            }

            val bytes = api.exportPack(bearer, remote.id).bytes()
            val extracted = extractor.extract(remote.id, bytes)
            db.stickerDao().upsertPack(
                extracted.entity.copy(
                    isPublic = remote.isPublic,
                    isOwner = remote.isOwner,
                    syncHash = remote.syncHash,
                    updatedAt = remote.updatedAt,
                ),
            )
            db.stickerDao().deleteStickers(extracted.entity.id)
            db.stickerDao().upsertStickers(extracted.stickers)
        }
    }

    suspend fun uploadSticker(packId: String, uri: Uri) = withContext(Dispatchers.IO) {
        api.uploadSticker(bearerToken(), packId, multipartFromUri(uri)).close()
        sync()
    }

    suspend fun replaceTrayIcon(packId: String, uri: Uri) = withContext(Dispatchers.IO) {
        api.replaceTrayIcon(bearerToken(), packId, multipartFromUri(uri)).close()
        sync()
    }

    private fun bearerToken(): String {
        val token = session.token() ?: error("Login first")
        return "Bearer $token"
    }

    private fun multipartFromUri(uri: Uri): MultipartBody.Part {
        val resolver = appContext.contentResolver
        val mediaType = resolver.getType(uri) ?: "image/*"
        val fileName = displayName(uri) ?: "sticker-foundry-${System.currentTimeMillis()}.png"
        val bytes = resolver.openInputStream(uri)?.use { it.readBytes() }
            ?: error("Cannot read selected image")
        val requestBody = bytes.toRequestBody(mediaType.toMediaTypeOrNull())
        return MultipartBody.Part.createFormData("file", fileName, requestBody)
    }

    private fun displayName(uri: Uri): String? =
        appContext.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
        }

    companion object {
        @Volatile private var instance: StickerRepository? = null

        fun get(context: Context): StickerRepository =
            instance ?: synchronized(this) {
                instance ?: StickerRepository(context).also { instance = it }
            }
    }
}
