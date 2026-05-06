package com.example.stickerplatform

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.stickerplatform.data.ImageEditOptions
import com.example.stickerplatform.data.PackEntity
import com.example.stickerplatform.data.StickerRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.Locale

class StickerViewModel(
    private val repository: StickerRepository,
) : ViewModel() {
    val packs: StateFlow<List<PackEntity>> = repository.observePacks()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val status = MutableStateFlow("")
    val serverUrl = MutableStateFlow(repository.serverUrl())
    val cacheUsage = MutableStateFlow(formatBytes(repository.cacheSizeBytes()))

    fun login(email: String, password: String) {
        viewModelScope.launch {
            runCatching { repository.login(email, password) }
                .onSuccess { status.value = "Logged in" }
                .onFailure { status.value = it.message ?: "Login failed" }
        }
    }

    fun sync() {
        viewModelScope.launch {
            status.value = "Syncing packs"
            runCatching { repository.sync() }
                .onSuccess { status.value = "Sync complete" }
                .onFailure { status.value = it.message ?: "Sync failed" }
        }
    }

    fun saveServerUrl(url: String) {
        viewModelScope.launch {
            runCatching { repository.saveServerUrl(url) }
                .onSuccess {
                    serverUrl.value = repository.serverUrl()
                    status.value = "Server URL saved"
                }
                .onFailure { status.value = it.message ?: "Server URL update failed" }
        }
    }

    fun logout() {
        viewModelScope.launch {
            runCatching { repository.logout() }
                .onSuccess { status.value = "Logged out" }
                .onFailure { status.value = it.message ?: "Logout failed" }
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
                    status.value = "Cache cleared"
                }
                .onFailure { status.value = it.message ?: "Cache cleanup failed" }
        }
    }

    fun uploadSticker(packId: String, uri: Uri, options: ImageEditOptions) {
        viewModelScope.launch {
            status.value = "Uploading sticker"
            runCatching { repository.uploadSticker(packId, uri, options) }
                .onSuccess { status.value = "Sticker uploaded" }
                .onFailure { status.value = it.message ?: "Sticker upload failed" }
        }
    }

    fun replaceTrayIcon(packId: String, uri: Uri, options: ImageEditOptions) {
        viewModelScope.launch {
            status.value = "Replacing tray icon"
            runCatching { repository.replaceTrayIcon(packId, uri, options) }
                .onSuccess { status.value = "Tray icon replaced" }
                .onFailure { status.value = it.message ?: "Tray icon update failed" }
        }
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
