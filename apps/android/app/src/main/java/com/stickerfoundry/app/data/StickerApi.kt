package com.stickerfoundry.app.data

import okhttp3.ResponseBody
import okhttp3.MultipartBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Streaming

interface StickerApi {
    @GET("health")
    suspend fun health(): HealthResponse

    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): AuthResponse

    @POST("auth/refresh")
    suspend fun refresh(@Body request: RefreshTokenRequest): AuthResponse

    @POST("auth/logout")
    suspend fun logout(@Body request: RefreshTokenRequest): ResponseBody

    @GET("packs")
    suspend fun packs(@Header("Authorization") bearerToken: String): List<PackDto>

    @GET("sync/packs")
    suspend fun syncPacks(@Header("Authorization") bearerToken: String): SyncPacksResponse

    @Multipart
    @POST("packs/{id}/stickers")
    suspend fun uploadSticker(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Header("If-Match") ifMatch: String,
        @Part file: MultipartBody.Part,
        @Part options: List<MultipartBody.Part>,
    ): ResponseBody

    @Multipart
    @POST("packs/{id}/stickers/jobs")
    suspend fun queueStickerUpload(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Header("If-Match") ifMatch: String,
        @Part file: MultipartBody.Part,
        @Part options: List<MultipartBody.Part>,
    ): JobDto

    @Multipart
    @POST("packs/{id}/tray-icon")
    suspend fun replaceTrayIcon(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Header("If-Match") ifMatch: String,
        @Part file: MultipartBody.Part,
    ): ResponseBody

    @Streaming
    @GET("packs/{id}/export")
    suspend fun exportPack(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
    ): ResponseBody

    @POST("packs/{id}/export/jobs")
    suspend fun queueExport(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
    ): JobDto

    @GET("jobs/{id}")
    suspend fun job(
        @Header("Authorization") bearerToken: String,
        @Path("id") jobId: String,
    ): JobDto

    @GET("packs/{id}/manifest")
    suspend fun packManifest(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Header("If-None-Match") ifNoneMatch: String? = null,
    ): Response<PackManifestDto>
}
