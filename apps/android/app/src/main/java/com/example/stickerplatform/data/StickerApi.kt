package com.example.stickerplatform.data

import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Streaming

interface StickerApi {
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): AuthResponse

    @GET("packs")
    suspend fun packs(@Header("Authorization") bearerToken: String): List<PackDto>

    @Streaming
    @GET("packs/{id}/export")
    suspend fun exportPack(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
    ): ResponseBody
}
