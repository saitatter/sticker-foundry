package com.example.stickerplatform

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.stickerplatform.data.ImageEditOptions
import com.example.stickerplatform.data.PackEntity
import com.example.stickerplatform.data.StickerRepository
import com.example.stickerplatform.data.StickerEntity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import retrofit2.HttpException
import java.io.IOException
import java.net.ConnectException
import java.net.UnknownHostException
import java.net.SocketTimeoutException
import java.util.Locale
import javax.net.ssl.SSLHandshakeException

data class AppStatus(
    val message: String = "",
    val isError: Boolean = false,
)

class StickerViewModel(
    private val repository: StickerRepository,
) : ViewModel() {
    val packs: StateFlow<List<PackEntity>> = repository.observePacks()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val stickersByPack: StateFlow<Map<String, List<StickerEntity>>> = repository.observeStickers()
        .map { stickers -> stickers.groupBy { it.packId } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())

    val status = MutableStateFlow(AppStatus())
    val serverUrl = MutableStateFlow(repository.serverUrl())
    val cacheUsage = MutableStateFlow(formatBytes(repository.cacheSizeBytes()))

    fun login(email: String, password: String) {
        viewModelScope.launch {
            runCatching { repository.login(email, password) }
                .onSuccess { setInfo("Logged in") }
                .onFailure { setError(it, "Login failed") }
        }
    }

    fun sync() {
        viewModelScope.launch {
            setInfo("Syncing packs")
            runCatching { repository.sync() }
                .onSuccess { setInfo("Sync complete") }
                .onFailure { setError(it, "Sync failed") }
        }
    }

    fun saveServerUrl(url: String) {
        viewModelScope.launch {
            runCatching { repository.saveServerUrl(url) }
                .onSuccess {
                    serverUrl.value = repository.serverUrl()
                    setInfo("Server URL saved")
                }
                .onFailure { setError(it, "Server URL update failed") }
        }
    }

    fun logout() {
        viewModelScope.launch {
            runCatching { repository.logout() }
                .onSuccess { setInfo("Logged out") }
                .onFailure { setError(it, "Logout failed") }
        }
    }

    fun refreshCacheUsage() {
        cacheUsage.value = formatBytes(repository.cacheSizeBytes())
    }

    fun clearCache() {
        viewModelScope.launch {
            runCatching { repository.clearCache() }
                .onSuccess {
                    refreshCacheUsage()
                    setInfo("Cache cleared")
                }
                .onFailure { setError(it, "Cache cleanup failed") }
        }
    }

    fun uploadSticker(packId: String, uri: Uri, options: ImageEditOptions) {
        viewModelScope.launch {
            setInfo("Uploading sticker")
            runCatching { repository.uploadSticker(packId, uri, options) }
                .onSuccess { setInfo("Sticker uploaded") }
                .onFailure { setError(it, "Sticker upload failed") }
        }
    }

    fun replaceTrayIcon(packId: String, uri: Uri, options: ImageEditOptions) {
        viewModelScope.launch {
            setInfo("Replacing tray icon")
            runCatching { repository.replaceTrayIcon(packId, uri, options) }
                .onSuccess { setInfo("Tray icon replaced") }
                .onFailure { setError(it, "Tray icon update failed") }
        }
    }

    private fun setInfo(message: String) {
        status.value = AppStatus(message)
    }

    private fun setError(error: Throwable, fallback: String) {
        status.value = AppStatus(friendlyError(error, fallback), isError = true)
    }

    private fun friendlyError(error: Throwable, fallback: String): String = when (error) {
        is IllegalArgumentException -> error.message ?: fallback
        is UnknownHostException -> "Could not find that server. Check the URL or DNS."
        is ConnectException -> "Could not reach the server. Check that StickerFoundry is running and the URL is correct."
        is SocketTimeoutException -> "The server took too long to respond. Try again or check your network."
        is SSLHandshakeException -> "Secure connection failed. Check the HTTPS certificate or use HTTP for local testing."
        is HttpException -> httpErrorMessage(error, fallback)
        is IOException -> "Network error. Check Wi-Fi, VPN, firewall, and the server URL."
        else -> error.message?.takeIf { it.isNotBlank() } ?: fallback
    }

    private fun httpErrorMessage(error: HttpException, fallback: String): String = when (error.code()) {
        400 -> "The server rejected the request. Check the selected image or settings."
        401 -> "Session expired. Log in again."
        403 -> "This account does not have permission for that action."
        404 -> "The server endpoint was not found. Check that the URL includes /api/."
        in 500..599 -> "StickerFoundry server error (${error.code()}). Check the backend logs."
        else -> "$fallback (${error.code()})"
    }

    companion object {
        private fun formatBytes(bytes: Long): String {
            if (bytes < 1024) return "$bytes B"
            val units = listOf("KB", "MB", "GB")
            var value = bytes / 1024.0
            var unitIndex = 0
            while (value >= 1024 && unitIndex < units.lastIndex) {
                value /= 1024
                unitIndex += 1
            }
            return String.format(Locale.US, "%.1f %s", value, units[unitIndex])
        }

        fun factory(context: Context): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return StickerViewModel(StickerRepository.get(context)) as T
                }
            }
    }
}
