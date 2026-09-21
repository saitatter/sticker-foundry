package com.stickerfoundry.app.whatsapp

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.ActivityNotFoundException
import android.net.Uri
import android.widget.Toast
import com.stickerfoundry.app.BuildConfig
import com.stickerfoundry.app.data.EXTRACTION_READY
import com.stickerfoundry.app.data.PackEntity

object WhatsAppStickerLauncher {
    private const val ACTION_ENABLE_STICKER_PACK = "com.whatsapp.intent.action.ENABLE_STICKER_PACK"
    private const val WHATSAPP_PACKAGE = "com.whatsapp"
    private const val WHATSAPP_BUSINESS_PACKAGE = "com.whatsapp.w4b"
    private const val WHATSAPP_WHITELIST_AUTHORITY = "com.whatsapp.provider.sticker_whitelist_check"
    private const val WHATSAPP_BUSINESS_WHITELIST_AUTHORITY = "com.whatsapp.w4b.provider.sticker_whitelist_check"

    fun addPack(context: Context, pack: PackEntity) {
        addPack(context, pack, WHATSAPP_PACKAGE, "WhatsApp")
    }

    fun addPackToBusiness(context: Context, pack: PackEntity) {
        addPack(context, pack, WHATSAPP_BUSINESS_PACKAGE, "WhatsApp Business")
    }

    fun openWhatsApp(context: Context, business: Boolean = false) {
        val packageName = if (business) WHATSAPP_BUSINESS_PACKAGE else WHATSAPP_PACKAGE
        val appName = if (business) "WhatsApp Business" else "WhatsApp"
        val launchIntent = context.packageManager.getLaunchIntentForPackage(packageName)
        if (launchIntent == null) {
            showUnavailable(context, "$appName is not installed on this device")
            return
        }
        if (context !is Activity) launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(launchIntent)
    }

    /** Returns true/false when WhatsApp supports the check, or null when it cannot be queried. */
    fun isPackAdded(context: Context, pack: PackEntity, business: Boolean = false): Boolean? {
        val whitelistAuthority = if (business) WHATSAPP_BUSINESS_WHITELIST_AUTHORITY else WHATSAPP_WHITELIST_AUTHORITY
        val uri = Uri.parse("content://$whitelistAuthority/is_whitelisted").buildUpon()
            .appendQueryParameter("authority", BuildConfig.CONTENT_PROVIDER_AUTHORITY)
            .appendQueryParameter("identifier", pack.id)
            .build()

        return try {
            context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                if (!cursor.moveToFirst()) return null
                val resultColumn = cursor.getColumnIndex("result")
                if (resultColumn < 0 || cursor.isNull(resultColumn)) null else cursor.getInt(resultColumn) == 1
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun addPack(context: Context, pack: PackEntity, packageName: String, appName: String) {
        if (pack.extractionStatus != EXTRACTION_READY) {
            showUnavailable(context, "Sync this pack before importing it into $appName")
            return
        }
        if (pack.stickerCount !in 3..30) {
            showUnavailable(context, "$appName packs must contain between 3 and 30 stickers")
            return
        }

        val intent = Intent(ACTION_ENABLE_STICKER_PACK).apply {
            setPackage(packageName)
            putExtra("sticker_pack_id", pack.id)
            putExtra("sticker_pack_authority", BuildConfig.CONTENT_PROVIDER_AUTHORITY)
            putExtra("sticker_pack_name", pack.name)
        }

        try {
            if (context !is Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            showUnavailable(context, "$appName could not open the sticker import screen")
        } catch (_: SecurityException) {
            showUnavailable(context, "$appName rejected the sticker import request")
        } catch (_: Exception) {
            showUnavailable(context, "$appName could not start sticker import")
        }
    }

    private fun showUnavailable(context: Context, message: String) {
        Toast.makeText(context, message, Toast.LENGTH_LONG).show()
    }
}
