package com.example.stickerplatform.whatsapp

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.widget.Toast
import com.example.stickerplatform.BuildConfig
import com.example.stickerplatform.data.PackEntity

object WhatsAppStickerLauncher {
    private const val ACTION_ENABLE_STICKER_PACK = "com.whatsapp.intent.action.ENABLE_STICKER_PACK"

    fun addPack(context: Context, pack: PackEntity) {
        val intent = Intent(ACTION_ENABLE_STICKER_PACK).apply {
            putExtra("sticker_pack_id", pack.id)
            putExtra("sticker_pack_authority", BuildConfig.CONTENT_PROVIDER_AUTHORITY)
            putExtra("sticker_pack_name", pack.name)
        }

        try {
            context.startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(context, "WhatsApp sticker import is not available on this device", Toast.LENGTH_LONG).show()
        }
    }
}
