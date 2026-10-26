package com.stickerfoundry.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Base64
import com.stickerfoundry.app.data.LocalDatabase
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.util.concurrent.Executors
import java.util.zip.ZipInputStream
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class MainActivity : FlutterActivity() {
    private val executor = Executors.newSingleThreadExecutor()
    private var importResult: MethodChannel.Result? = null
    private val authority = "com.stickerfoundry.app.stickercontentprovider"
    override fun configureFlutterEngine(engine: FlutterEngine) {
        super.configureFlutterEngine(engine)
        MethodChannel(engine.dartExecutor.binaryMessenger, "com.stickerfoundry.app/native").setMethodCallHandler { call, result ->
            val args = call.arguments as? Map<*, *> ?: emptyMap<Any, Any>()
            if (call.method == "importPack" || call.method == "openWhatsApp") {
                val pkg = if (args["business"] == true) "com.whatsapp.w4b" else "com.whatsapp"
                try {
                    if (call.method == "openWhatsApp") { val intent = packageManager.getLaunchIntentForPackage(pkg) ?: error("WhatsApp is not installed"); startActivity(intent); result.success(null) }
                    else {
                        check(importResult == null) { "An import is already open" }
                        val pack = LocalDatabase.providerGet(this).getPackBlocking(args["id"] as String) ?: error("Sync this pack before importing")
                        check(LocalDatabase.providerGet(this).getStickersBlocking(pack.id).size in 3..30) { "WhatsApp packs require 3–30 stickers" }
                        importResult = result
                        startActivityForResult(Intent("com.whatsapp.intent.action.ENABLE_STICKER_PACK").setPackage(pkg).putExtra("sticker_pack_id", pack.id).putExtra("sticker_pack_authority", authority).putExtra("sticker_pack_name", pack.name), 7123)
                    }
                } catch (e: Exception) { importResult = null; result.error("WHATSAPP", e.message ?: "Could not open WhatsApp", null) }
            } else executor.execute {
                try {
                    val value: Any? = when (call.method) {
                        "legacySession" -> legacySession()
                        "clearLegacySession" -> { getSharedPreferences("session", MODE_PRIVATE).edit().remove("secure_accessToken").remove("secure_refreshToken").remove("accountLabel").apply(); null }
                        "installPack" -> { install(JSONObject(args["pack"] as Map<*, *>), args["zip"] as ByteArray); null }
                        "clearCache" -> { LocalDatabase.providerGet(this).clear(); File(filesDir, "packs").deleteRecursively(); contentResolver.notifyChange(Uri.parse("content://$authority/metadata"), null); null }
                        "removePack" -> { val id = args["id"] as String; require(id.matches(Regex("[A-Za-z0-9_-]{1,128}"))); LocalDatabase.providerGet(this).remove(id); File(File(filesDir, "packs"), id).deleteRecursively(); contentResolver.notifyChange(Uri.parse("content://$authority/metadata"), null); null }
                        "isPackAdded" -> {
                            val host = if (args["business"] == true) "com.whatsapp.w4b.provider.sticker_whitelist_check" else "com.whatsapp.provider.sticker_whitelist_check"
                            val uri = Uri.parse("content://$host/is_whitelisted").buildUpon().appendQueryParameter("authority", authority).appendQueryParameter("identifier", args["id"] as String).build()
                            try { contentResolver.query(uri, null, null, null, null)?.use { it.moveToFirst() && it.getInt(it.getColumnIndexOrThrow("result")) == 1 } ?: false } catch (_: Exception) { false }
                        }
                        else -> { runOnUiThread { result.notImplemented() }; return@execute }
                    }
                    runOnUiThread { result.success(value) }
                } catch (e: Exception) { runOnUiThread { result.error("NATIVE", e.message, null) } }
            }
        }
    }
    @Deprecated("Used by the WhatsApp import contract")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 7123) {
            val pending = importResult; importResult = null
            val error = data?.getStringExtra("validation_error")
            if (error != null) pending?.error("WHATSAPP_VALIDATION", error, null)
            else pending?.success(if (resultCode == Activity.RESULT_OK) "Pack added to WhatsApp" else "WhatsApp import cancelled")
        }
    }
    private fun legacySession(): Map<String, Any?> {
        val prefs = getSharedPreferences("session", MODE_PRIVATE)
        fun read(key: String): String? { return try {
            val parts = (prefs.getString("secure_$key", null) ?: return null).split(':', limit = 2)
            val secret = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.getKey("com.stickerfoundry.app.session", null) as SecretKey
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, secret, GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP))) }
            cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)).toString(Charsets.UTF_8)
        } catch (_: Exception) { null } }
        val data = mapOf("serverUrl" to (prefs.getString("serverUrl", null) ?: "http://127.0.0.1:8080/api/"), "accessToken" to read("accessToken"), "refreshToken" to read("refreshToken"))
        return data
    }
    private fun install(meta: JSONObject, bytes: ByteArray) {
        val id = meta.getString("id"); require(id.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "Invalid pack identifier" }
        val root = File(filesDir, "packs").apply { mkdirs() }; val target = File(root, id); val temp = File(root, ".$id.tmp").apply { deleteRecursively(); mkdirs() }; val backup = File(root, ".$id.backup")
        try {
            ZipInputStream(bytes.inputStream()).use { zip ->
                var total = 0L
                while (true) {
                    val entry = zip.nextEntry ?: break; val out = File(temp, entry.name).canonicalFile
                    require(out.path.startsWith(temp.canonicalPath + File.separator)) { "Unsafe ZIP path" }
                    if (entry.isDirectory) out.mkdirs() else { out.parentFile?.mkdirs(); out.outputStream().use { stream -> val buf = ByteArray(8192); while (true) { val count = zip.read(buf); if (count < 0) break; total += count; require(total <= 32 * 1024 * 1024) { "Export is too large" }; stream.write(buf, 0, count) } } }
                }
            }
            val contents = JSONObject(File(temp, "contents.json").readText()).getJSONArray("sticker_packs").getJSONObject(0)
            require(contents.getString("identifier") == id) { "Pack identifier mismatch" }
            backup.deleteRecursively(); if (target.exists()) check(target.renameTo(backup)) { "Cannot replace cached pack" }
            if (!temp.renameTo(target)) { backup.renameTo(target); error("Cannot install cached pack") }
            try { LocalDatabase.providerGet(this).install(meta, contents, target.absolutePath) } catch (e: Exception) { target.deleteRecursively(); backup.renameTo(target); throw e }
            backup.deleteRecursively(); contentResolver.notifyChange(Uri.parse("content://$authority/metadata/$id"), null); contentResolver.notifyChange(Uri.parse("content://$authority/stickers/$id"), null)
        } finally { temp.deleteRecursively() }
    }
}
