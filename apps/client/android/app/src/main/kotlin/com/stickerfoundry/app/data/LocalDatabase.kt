package com.stickerfoundry.app.data

import android.content.Context
import android.content.ContentValues
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject

data class PackEntity(val id: String, val name: String, val publisher: String, val trayImageFile: String, val imageDataVersion: String, val localPath: String, val isAnimated: Boolean)
data class StickerEntity(val packId: String, val fileName: String, val emojisCsv: String, val accessibilityText: String?)

/** Private WhatsApp cache, populated from exported packs. */
class LocalDatabase private constructor(context: Context) : SQLiteOpenHelper(context, "whatsapp_cache.db", null, 1) {
    override fun onConfigure(db: SQLiteDatabase) { db.setForeignKeyConstraintsEnabled(true) }
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE packs (id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL, publisher TEXT NOT NULL, trayImageFile TEXT NOT NULL, imageDataVersion TEXT NOT NULL, localPath TEXT NOT NULL, isAnimated INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE stickers (packId TEXT NOT NULL, fileName TEXT NOT NULL, emojisCsv TEXT NOT NULL, accessibilityText TEXT, PRIMARY KEY(packId,fileName), FOREIGN KEY(packId) REFERENCES packs(id) ON DELETE CASCADE)")
        db.execSQL("CREATE INDEX index_stickers_packId ON stickers(packId)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS stickers")
        db.execSQL("DROP TABLE IF EXISTS packs")
        onCreate(db)
    }
    private fun pack(c: Cursor) = PackEntity(c.getString(c.getColumnIndexOrThrow("id")), c.getString(c.getColumnIndexOrThrow("name")), c.getString(c.getColumnIndexOrThrow("publisher")), c.getString(c.getColumnIndexOrThrow("trayImageFile")), c.getString(c.getColumnIndexOrThrow("imageDataVersion")), c.getString(c.getColumnIndexOrThrow("localPath")), c.getInt(c.getColumnIndexOrThrow("isAnimated")) != 0)
    fun getAllPacksBlocking(): List<PackEntity> = readableDatabase.rawQuery("SELECT * FROM packs ORDER BY name", null).use { c -> buildList { while (c.moveToNext()) add(pack(c)) } }
    fun getPackBlocking(id: String): PackEntity? = readableDatabase.rawQuery("SELECT * FROM packs WHERE id=?", arrayOf(id)).use { c -> if (c.moveToFirst()) pack(c) else null }
    fun getStickersBlocking(id: String): List<StickerEntity> = readableDatabase.rawQuery("SELECT * FROM stickers WHERE packId=? ORDER BY fileName", arrayOf(id)).use { c -> buildList { while (c.moveToNext()) add(StickerEntity(id, c.getString(c.getColumnIndexOrThrow("fileName")), c.getString(c.getColumnIndexOrThrow("emojisCsv")), c.getString(c.getColumnIndexOrThrow("accessibilityText")))) } }
    fun install(meta: JSONObject, contents: JSONObject, path: String) {
        val db = writableDatabase; val id = meta.getString("id"); val stickers = contents.getJSONArray("stickers")
        db.beginTransaction()
        try {
            db.delete("packs", "id=?", arrayOf(id))
            val values = ContentValues().apply {
                put("id", id); put("name", meta.getString("name")); put("publisher", meta.getString("publisher"))
                put("trayImageFile", contents.getString("tray_image_file")); put("imageDataVersion", meta.getString("imageDataVersion"))
                put("localPath", path); put("isAnimated", if (meta.optBoolean("isAnimated")) 1 else 0)
            }
            db.insertOrThrow("packs", null, values)
            for (i in 0 until stickers.length()) {
                val sticker = stickers.getJSONObject(i); val emoji = sticker.optJSONArray("emojis")
                db.insertOrThrow("stickers", null, ContentValues().apply { put("packId", id); put("fileName", sticker.getString("image_file")); put("emojisCsv", if (emoji == null) "" else (0 until minOf(emoji.length(), 3)).joinToString(",") { emoji.getString(it) }); put("accessibilityText", sticker.optString("accessibility_text")) })
            }
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }
    fun clear() { writableDatabase.delete("packs", null, null) }
    fun remove(id: String) { writableDatabase.delete("packs", "id=?", arrayOf(id)) }
    companion object {
        @Volatile private var instance: LocalDatabase? = null
        fun providerGet(context: Context): LocalDatabase = instance ?: synchronized(this) { instance ?: LocalDatabase(context.applicationContext).also { instance = it } }
    }
}
