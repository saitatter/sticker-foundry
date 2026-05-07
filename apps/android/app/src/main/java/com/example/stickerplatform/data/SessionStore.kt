package com.example.stickerplatform.data

import android.content.Context
import com.example.stickerplatform.BuildConfig
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)

    fun token(): String? = prefs.getString("token", null)

    fun refreshToken(): String? = prefs.getString("refreshToken", null)

    fun serverUrl(): String = prefs.getString("serverUrl", null) ?: BuildConfig.API_BASE_URL

    fun saveToken(token: String) {
        prefs.edit().putString("token", token).apply()
    }

    fun saveTokens(token: String, refreshToken: String) {
        prefs.edit()
            .putString("token", token)
            .putString("refreshToken", refreshToken)
            .apply()
    }

    fun saveServerUrl(url: String) {
        prefs.edit().putString("serverUrl", normalizeServerUrl(url)).apply()
    }

    fun clearToken() {
        prefs.edit().remove("token").remove("refreshToken").apply()
    }

    private fun normalizeServerUrl(url: String): String {
        val trimmed = url.trim()
        if (trimmed.isBlank()) {
            throw IllegalArgumentException("Enter a server URL, for example http://10.0.2.2:3000/api/")
        }

        val parsed = trimmed.toHttpUrlOrNull()
            ?: throw IllegalArgumentException("Enter a valid HTTP or HTTPS server URL")
        if (parsed.query != null || parsed.fragment != null) {
            throw IllegalArgumentException("Server URL must not include query parameters or fragments")
        }

        val normalized = parsed.toString()
        return if (normalized.endsWith("/")) normalized else "$normalized/"
    }
}
