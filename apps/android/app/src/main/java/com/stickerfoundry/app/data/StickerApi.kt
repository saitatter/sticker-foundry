package com.stickerfoundry.app.data

import okhttp3.ResponseBody
import okhttp3.MultipartBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.PUT
import retrofit2.http.Query
import retrofit2.http.Streaming

interface StickerApi {
    @GET("health")
    suspend fun health(): HealthResponse

    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): AuthResponse

    @POST("auth/register")
    suspend fun register(@Body request: RegisterRequest): AuthResponse

    @POST("auth/refresh")
    suspend fun refresh(@Body request: RefreshTokenRequest): AuthResponse

    @POST("auth/logout")
    suspend fun logout(@Body request: RefreshTokenRequest): ResponseBody

    @GET("auth/me")
    suspend fun me(@Header("Authorization") bearerToken: String): UserDto

    @PATCH("auth/password")
    suspend fun changePassword(
        @Header("Authorization") bearerToken: String,
        @Body request: ChangePasswordRequest,
    ): ResponseBody

    @POST("auth/password/reset/request")
    suspend fun requestPasswordReset(@Body request: PasswordResetRequest): ResponseBody

    @POST("auth/password/reset/confirm")
    suspend fun resetPassword(@Body request: PasswordResetConfirmRequest): ResponseBody

    @GET("auth/sessions")
    suspend fun sessions(@Header("Authorization") bearerToken: String): List<UserSessionDto>

    @DELETE("auth/sessions")
    suspend fun revokeAllSessions(@Header("Authorization") bearerToken: String): ResponseBody

    @DELETE("auth/sessions/{id}")
    suspend fun revokeSession(
        @Header("Authorization") bearerToken: String,
        @Path("id") sessionId: String,
    ): ResponseBody

    @GET("instance")
    suspend fun instanceSettings(): InstanceSettingsDto

    @GET("admin/settings")
    suspend fun adminSettings(@Header("Authorization") bearerToken: String): AdminSettingsDto

    @PATCH("admin/settings")
    suspend fun updateAdminSettings(
        @Header("Authorization") bearerToken: String,
        @Body request: UpdateAdminSettingsRequest,
    ): AdminSettingsDto

    @GET("admin/audit-log")
    suspend fun adminAuditLog(
        @Header("Authorization") bearerToken: String,
        @Query("limit") limit: Int? = null,
    ): List<AuditLogEntryDto>

    @POST("admin/audit-log/cleanup")
    suspend fun cleanupAuditLog(@Header("Authorization") bearerToken: String): ResponseBody

    @GET("packs")
    suspend fun packs(@Header("Authorization") bearerToken: String): List<PackDto>

    @GET("public/packs")
    suspend fun publicPacks(): List<PackDto>

    @GET("packs/{id}")
    suspend fun pack(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
    ): PackDetailDto

    @POST("packs")
    suspend fun createPack(
        @Header("Authorization") bearerToken: String,
        @Body request: CreatePackRequest,
    ): PackDetailDto

    @PATCH("packs/{id}")
    suspend fun updatePack(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Body request: UpdatePackRequest,
    ): PackDetailDto

    @DELETE("packs/{id}")
    suspend fun deletePack(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
    ): ResponseBody

    @POST("packs/{id}/clone")
    suspend fun clonePack(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
    ): PackDetailDto

    @GET("packs/{id}/members")
    suspend fun packMembers(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
    ): List<PackMemberDto>

    @PATCH("packs/{id}/members/{memberId}")
    suspend fun updatePackMember(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Path("memberId") memberId: String,
        @Body request: RoleRequest,
    ): PackMemberDto

    @DELETE("packs/{id}/members/{memberId}")
    suspend fun removePackMember(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Path("memberId") memberId: String,
    ): ResponseBody

    @GET("packs/{id}/invites")
    suspend fun packInvites(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
    ): List<PackInviteDto>

    @POST("packs/{id}/invites")
    suspend fun createPackInvite(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Body request: CreateInviteRequest,
    ): PackInviteDto

    @DELETE("packs/{id}/invites/{inviteId}")
    suspend fun revokePackInvite(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Path("inviteId") inviteId: String,
    ): ResponseBody

    @POST("packs/invites/{code}/accept")
    suspend fun acceptPackInvite(
        @Header("Authorization") bearerToken: String,
        @Path("code") code: String,
    ): PackDetailDto

    @GET("packs/{id}/activity")
    suspend fun packActivity(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Query("limit") limit: Int? = null,
    ): List<AuditLogEntryDto>

    @DELETE("packs/{id}/activity/{activityId}")
    suspend fun deletePackActivity(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Path("activityId") activityId: String,
    ): ResponseBody

    @DELETE("packs/{id}/activity")
    suspend fun clearPackActivity(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
    ): ResponseBody

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
    @PUT("packs/{id}/stickers/{stickerId}/file")
    suspend fun replaceStickerImage(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Path("stickerId") stickerId: String,
        @Header("If-Match") ifMatch: String,
        @Part file: MultipartBody.Part,
        @Part options: List<MultipartBody.Part>,
    ): StickerDto

    @PATCH("packs/{id}/stickers/{stickerId}")
    suspend fun updateSticker(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Path("stickerId") stickerId: String,
        @Body request: UpdateStickerRequest,
    ): StickerDto

    @DELETE("packs/{id}/stickers/{stickerId}")
    suspend fun deleteSticker(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Path("stickerId") stickerId: String,
    ): ResponseBody

    @Streaming
    @GET("packs/{id}/stickers/{stickerId}/file")
    suspend fun stickerFile(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Path("stickerId") stickerId: String,
    ): ResponseBody

    @PATCH("packs/{id}/stickers")
    suspend fun reorderStickers(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Body request: ReorderStickersRequest,
    ): PackDetailDto

    @POST("packs/{id}/stickers/copy")
    suspend fun copyStickers(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Body request: TransferStickersRequest,
    ): PackDetailDto

    @POST("packs/{id}/stickers/move")
    suspend fun moveStickers(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Body request: TransferStickersRequest,
    ): PackDetailDto

    @GET("packs/{id}/stickers/{stickerId}/comments")
    suspend fun stickerComments(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Path("stickerId") stickerId: String,
    ): List<StickerCommentDto>

    @POST("packs/{id}/stickers/{stickerId}/comments")
    suspend fun createStickerComment(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Path("stickerId") stickerId: String,
        @Body request: CreateCommentRequest,
    ): StickerCommentDto

    @DELETE("packs/{id}/stickers/{stickerId}/comments/{commentId}")
    suspend fun deleteStickerComment(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Path("stickerId") stickerId: String,
        @Path("commentId") commentId: String,
    ): ResponseBody

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

    @GET("packs/{id}/contents")
    suspend fun exportContents(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
    ): ResponseBody

    @Streaming
    @GET("admin/audit-log/export")
    suspend fun exportAuditLog(
        @Header("Authorization") bearerToken: String,
        @Query("limit") limit: Int? = null,
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

    @POST("jobs/{id}/cancel")
    suspend fun cancelJob(
        @Header("Authorization") bearerToken: String,
        @Path("id") jobId: String,
    ): JobDto

    @POST("jobs/{id}/retry")
    suspend fun retryJob(
        @Header("Authorization") bearerToken: String,
        @Path("id") jobId: String,
    ): JobDto

    @GET("teams")
    suspend fun teams(@Header("Authorization") bearerToken: String): List<TeamDto>

    @POST("teams")
    suspend fun createTeam(
        @Header("Authorization") bearerToken: String,
        @Body request: CreateTeamRequest,
    ): TeamDto

    @GET("teams/{id}/members")
    suspend fun teamMembers(
        @Header("Authorization") bearerToken: String,
        @Path("id") teamId: String,
    ): List<TeamMemberDto>

    @POST("teams/{id}/members")
    suspend fun addTeamMember(
        @Header("Authorization") bearerToken: String,
        @Path("id") teamId: String,
        @Body request: AddTeamMemberRequest,
    ): TeamMemberDto

    @PATCH("teams/{id}/members/{memberId}")
    suspend fun updateTeamMember(
        @Header("Authorization") bearerToken: String,
        @Path("id") teamId: String,
        @Path("memberId") memberId: String,
        @Body request: RoleRequest,
    ): TeamMemberDto

    @DELETE("teams/{id}/members/{memberId}")
    suspend fun removeTeamMember(
        @Header("Authorization") bearerToken: String,
        @Path("id") teamId: String,
        @Path("memberId") memberId: String,
    ): ResponseBody

    @GET("packs/{id}/manifest")
    suspend fun packManifest(
        @Header("Authorization") bearerToken: String,
        @Path("id") packId: String,
        @Header("If-None-Match") ifNoneMatch: String? = null,
    ): Response<PackManifestDto>
}
