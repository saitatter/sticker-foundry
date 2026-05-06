package com.example.stickerplatform.data

import android.content.Context
import com.example.stickerplatform.BuildConfig

class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)

    fun token(): String? = prefs.getString("token", null)

    fun serverUrl(): String = prefs.getString("serverUrl", null) ?: BuildConfig.API_BASE_URL

    fun saveToken(token: String) {
        prefs.edit().putString("token", token).apply()
    }

    fun saveServerUrl(url: String) {
        prefs.edit().putString("serverUrl", normalizeServerUrl(url)).apply()
    }

    fun clearToken() {
        prefs.edit().remove("token").apply()
    }

    private fun normalizeServerUrl(url: String): String {
        val trimmed = url.trim()
        return if (trimmed.endsWith("/")) trimmed else "$trimmed/"
    }
}
