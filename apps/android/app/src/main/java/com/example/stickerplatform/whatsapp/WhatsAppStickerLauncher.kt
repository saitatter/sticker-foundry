package com.example.stickerplatform.whatsapp

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.widget.Toast
import com.example.stickerplatform.BuildConfig
import com.example.stickerplatform.data.PackEntity

object WhatsAppStickerLauncher {
    private const val ACTION_ENABLE_STICKER_PACK = "com.whatsapp.intent.action.ENABLE_STICKER_PACK"
    private const val WHATSAPP_PACKAGE = "com.whatsapp"
    private const val WHATSAPP_BUSINESS_PACKAGE = "com.whatsapp.w4b"

    fun addPack(context: Context, pack: PackEntity) {
        addPack(context, pack, WHATSAPP_PACKAGE, "WhatsApp")
    }

    fun addPackToBusiness(context: Context, pack: PackEntity) {
        addPack(context, pack, WHATSAPP_BUSINESS_PACKAGE, "WhatsApp Business")
    }

    private fun addPack(context: Context, pack: PackEntity, packageName: String, appName: String) {
        val intent = Intent(ACTION_ENABLE_STICKER_PACK).apply {
            setPackage(packageName)
            putExtra("sticker_pack_id", pack.id)
            putExtra("sticker_pack_authority", BuildConfig.CONTENT_PROVIDER_AUTHORITY)
            putExtra("sticker_pack_name", pack.name)
        }

        try {
            context.startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(context, "$appName sticker import is not available on this device", Toast.LENGTH_LONG).show()
        }
    }
}
