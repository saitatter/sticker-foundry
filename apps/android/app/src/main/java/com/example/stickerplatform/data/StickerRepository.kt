package com.example.stickerplatform.data

import android.content.Context
import com.example.stickerplatform.BuildConfig
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
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
        val remotePacks = api.packs(bearer)

        for (remote in remotePacks) {
            if (remote.stickerCount < 3) {
                continue
            }
            val local = db.stickerDao().getPack(remote.id)
            if (local?.imageDataVersion == remote.imageDataVersion) {
                continue
            }

            val bytes = api.exportPack(bearer, remote.id).bytes()
            val extracted = extractor.extract(remote.id, bytes)
            db.stickerDao().upsertPack(
                extracted.entity.copy(
                    isPublic = remote.isPublic,
                    updatedAt = remote.updatedAt,
                ),
            )
            db.stickerDao().deleteStickers(extracted.entity.id)
            db.stickerDao().upsertStickers(extracted.stickers)
        }
    }

    companion object {
        @Volatile private var instance: StickerRepository? = null

        fun get(context: Context): StickerRepository =
            instance ?: synchronized(this) {
                instance ?: StickerRepository(context).also { instance = it }
            }
    }
}
