package com.stickerfoundry.app.data

import android.util.Base64
import android.content.Context
import android.security.keystore.KeyProperties
import com.stickerfoundry.app.BuildConfig
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)

    fun token(): String? = readSecure(ACCESS_TOKEN_KEY)

    fun refreshToken(): String? = readSecure(REFRESH_TOKEN_KEY)

    fun accountLabel(): String = prefs.getString("accountLabel", null) ?: "Not logged in"

    fun serverUrl(): String = prefs.getString("serverUrl", null) ?: BuildConfig.API_BASE_URL

    fun darkTheme(): Boolean = prefs.getBoolean(DARK_THEME_KEY, false)

    fun saveToken(token: String) {
        writeSecure(ACCESS_TOKEN_KEY, token)
    }

    fun saveTokens(token: String, refreshToken: String) {
        prefs.edit()
            .putString(secureKey(ACCESS_TOKEN_KEY), encrypt(token))
            .putString(secureKey(REFRESH_TOKEN_KEY), encrypt(refreshToken))
            .apply()
    }

    fun saveAccount(email: String, displayName: String) {
        val label = if (displayName.isNotBlank()) "$displayName <$email>" else email
        prefs.edit().putString("accountLabel", label).apply()
    }

    fun saveServerUrl(url: String) {
        prefs.edit().putString("serverUrl", normalizeServerUrl(url)).apply()
    }

    fun saveDarkTheme(enabled: Boolean) {
        prefs.edit().putBoolean(DARK_THEME_KEY, enabled).apply()
    }

    fun normalizedServerUrl(url: String): String = normalizeServerUrl(url)

    fun clearToken() {
        prefs.edit()
            .remove(secureKey(ACCESS_TOKEN_KEY))
            .remove(secureKey(REFRESH_TOKEN_KEY))
            .remove("accountLabel")
            .apply()
    }

    private fun readSecure(key: String): String? {
        val encoded = prefs.getString(secureKey(key), null) ?: return null
        return runCatching { decrypt(encoded) }.getOrElse {
            prefs.edit().remove(secureKey(key)).apply()
            null
        }
    }

    private fun writeSecure(key: String, value: String) {
        prefs.edit()
            .putString(secureKey(key), encrypt(value))
            .apply()
    }

    private fun secureKey(key: String): String = "secure_$key"

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
        val ciphertext = Base64.encodeToString(cipher.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        return "$iv:$ciphertext"
    }

    private fun decrypt(value: String): String {
        val parts = value.split(':', limit = 2)
        require(parts.size == 2)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(TAG_LENGTH_BITS, Base64.decode(parts[0], Base64.NO_WRAP)))
        return cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)).toString(Charsets.UTF_8)
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val existing = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
        if (existing != null) return existing

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(android.security.keystore.KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or android.security.keystore.KeyProperties.PURPOSE_DECRYPT,
        ).setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
            .build())
        return generator.generateKey()
    }

    companion object {
        private const val ACCESS_TOKEN_KEY = "accessToken"
        private const val REFRESH_TOKEN_KEY = "refreshToken"
        private const val DARK_THEME_KEY = "darkTheme"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "com.stickerfoundry.app.session"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val TAG_LENGTH_BITS = 128
    }

    private fun normalizeServerUrl(url: String): String {
        val trimmed = url.trim()
        if (trimmed.isBlank()) {
            throw IllegalArgumentException("Enter a server URL, for example http://10.0.2.2:3000/api/")
        }

        val urlWithScheme = if (trimmed.contains("://")) trimmed else "http://$trimmed"
        val parsed = urlWithScheme.toHttpUrlOrNull()
            ?: throw IllegalArgumentException("Enter a valid HTTP or HTTPS server URL")
        if (parsed.query != null || parsed.fragment != null) {
            throw IllegalArgumentException("Server URL must not include query parameters or fragments")
        }

        val withApiPath = if (parsed.encodedPath == "/") {
            parsed.newBuilder().addPathSegment("api").build()
        } else {
            parsed
        }
        val normalized = withApiPath.toString()
        return if (normalized.endsWith("/")) normalized else "$normalized/"
    }
}
