package com.example.stickerplatform

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.stickerplatform.data.PackEntity
import com.example.stickerplatform.data.StickerRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class StickerViewModel(
    private val repository: StickerRepository,
) : ViewModel() {
    val packs: StateFlow<List<PackEntity>> = repository.observePacks()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val status = MutableStateFlow("")

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

    companion object {
        fun factory(context: Context): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return StickerViewModel(StickerRepository.get(context)) as T
                }
            }
    }
}
