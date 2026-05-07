package com.stickerfoundry.app.whatsapp

import android.content.ContentProvider
import android.content.ContentResolver
import android.content.ContentValues
import android.content.UriMatcher
import android.content.res.AssetFileDescriptor
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.stickerfoundry.app.BuildConfig
import com.stickerfoundry.app.data.LocalDatabase
import java.io.File

class StickerContentProvider : ContentProvider() {
    private lateinit var matcher: UriMatcher

    override fun onCreate(): Boolean {
        val authority = BuildConfig.CONTENT_PROVIDER_AUTHORITY
        matcher = UriMatcher(UriMatcher.NO_MATCH).apply {
            addURI(authority, METADATA, METADATA_CODE)
            addURI(authority, "$METADATA/*", METADATA_SINGLE_CODE)
            addURI(authority, "$STICKERS/*", STICKERS_CODE)
            addURI(authority, "$STICKERS_ASSET/*/*", STICKERS_ASSET_CODE)
        }
        return true
    }

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?,
    ): Cursor {
        return when (matcher.match(uri)) {
            METADATA_CODE -> metadataCursor(uri, null)
            METADATA_SINGLE_CODE -> metadataCursor(uri, uri.lastPathSegment)
            STICKERS_CODE -> stickersCursor(uri, requireNotNull(uri.lastPathSegment))
            else -> throw IllegalArgumentException("Unknown URI: $uri")
        }
    }

    override fun openAssetFile(uri: Uri, mode: String): AssetFileDescriptor? {
        if (matcher.match(uri) != STICKERS_ASSET_CODE) return null
        val segments = uri.pathSegments
        require(segments.size == 3) { "Expected /stickers_asset/{packId}/{fileName}" }

        val packId = segments[1]
        val fileName = segments[2]
        val dao = LocalDatabase.providerGet(requireNotNull(context)).stickerDao()
        val pack = dao.getPackBlocking(packId) ?: return null
        val file = File(pack.localPath, fileName).canonicalFile
        val packDir = File(pack.localPath).canonicalFile
        if (!file.path.startsWith(packDir.path) || !file.exists()) return null

        val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        return AssetFileDescriptor(pfd, 0, AssetFileDescriptor.UNKNOWN_LENGTH)
    }

    override fun getType(uri: Uri): String {
        return when (matcher.match(uri)) {
            METADATA_CODE -> "vnd.android.cursor.dir/vnd.${BuildConfig.CONTENT_PROVIDER_AUTHORITY}.$METADATA"
            METADATA_SINGLE_CODE -> "vnd.android.cursor.item/vnd.${BuildConfig.CONTENT_PROVIDER_AUTHORITY}.$METADATA"
            STICKERS_CODE -> "vnd.android.cursor.dir/vnd.${BuildConfig.CONTENT_PROVIDER_AUTHORITY}.$STICKERS"
            STICKERS_ASSET_CODE -> "image/webp"
            else -> throw IllegalArgumentException("Unknown URI: $uri")
        }
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri {
        throw UnsupportedOperationException("Not supported")
    }

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int {
        throw UnsupportedOperationException("Not supported")
    }

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int {
        throw UnsupportedOperationException("Not supported")
    }

    private fun metadataCursor(uri: Uri, packId: String?): Cursor {
        val db = LocalDatabase.providerGet(requireNotNull(context))
        val cursor = MatrixCursor(
            arrayOf(
                STICKER_PACK_IDENTIFIER_IN_QUERY,
                STICKER_PACK_NAME_IN_QUERY,
                STICKER_PACK_PUBLISHER_IN_QUERY,
                STICKER_PACK_ICON_IN_QUERY,
                ANDROID_APP_DOWNLOAD_LINK_IN_QUERY,
                IOS_APP_DOWNLOAD_LINK_IN_QUERY,
                PUBLISHER_EMAIL,
                PUBLISHER_WEBSITE,
                PRIVACY_POLICY_WEBSITE,
                LICENSE_AGREEMENT_WEBSITE,
                IMAGE_DATA_VERSION,
                AVOID_CACHE,
                ANIMATED_STICKER_PACK,
            ),
        )

        val packs = if (packId == null) {
            db.stickerDao().getAllPacksBlocking()
        } else {
            listOfNotNull(db.stickerDao().getPackBlocking(packId))
        }

        packs.forEach { pack ->
            cursor.addRow(
                arrayOf<Any?>(
                    pack.id,
                    pack.name,
                    pack.publisher,
                    pack.trayImageFile,
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    pack.imageDataVersion,
                    0,
                    if (pack.isAnimated) 1 else 0,
                ),
            )
        }
        cursor.setNotificationUri(requireNotNull(context).contentResolver, uri)
        return cursor
    }

    private fun stickersCursor(uri: Uri, packId: String): Cursor {
        val db = LocalDatabase.providerGet(requireNotNull(context))
        val cursor = MatrixCursor(
            arrayOf(
                STICKER_FILE_NAME_IN_QUERY,
                STICKER_FILE_EMOJI_IN_QUERY,
                STICKER_FILE_ACCESSIBILITY_TEXT_IN_QUERY,
            ),
        )
        db.stickerDao().getStickersBlocking(packId).forEach { sticker ->
            cursor.addRow(arrayOf(sticker.fileName, sticker.emojisCsv, sticker.accessibilityText))
        }
        cursor.setNotificationUri(requireNotNull(context).contentResolver, uri)
        return cursor
    }

    companion object {
        private const val METADATA = "metadata"
        private const val STICKERS = "stickers"
        private const val STICKERS_ASSET = "stickers_asset"
        private const val METADATA_CODE = 1
        private const val METADATA_SINGLE_CODE = 2
        private const val STICKERS_CODE = 3
        private const val STICKERS_ASSET_CODE = 4

        val AUTHORITY_URI: Uri = Uri.Builder()
            .scheme(ContentResolver.SCHEME_CONTENT)
            .authority(BuildConfig.CONTENT_PROVIDER_AUTHORITY)
            .appendPath(METADATA)
            .build()

        private const val STICKER_PACK_IDENTIFIER_IN_QUERY = "sticker_pack_identifier"
        private const val STICKER_PACK_NAME_IN_QUERY = "sticker_pack_name"
        private const val STICKER_PACK_PUBLISHER_IN_QUERY = "sticker_pack_publisher"
        private const val STICKER_PACK_ICON_IN_QUERY = "sticker_pack_icon"
        private const val ANDROID_APP_DOWNLOAD_LINK_IN_QUERY = "android_play_store_link"
        private const val IOS_APP_DOWNLOAD_LINK_IN_QUERY = "ios_app_download_link"
        private const val PUBLISHER_EMAIL = "sticker_pack_publisher_email"
        private const val PUBLISHER_WEBSITE = "sticker_pack_publisher_website"
        private const val PRIVACY_POLICY_WEBSITE = "sticker_pack_privacy_policy_website"
        private const val LICENSE_AGREEMENT_WEBSITE = "sticker_pack_license_agreement_website"
        private const val IMAGE_DATA_VERSION = "image_data_version"
        private const val AVOID_CACHE = "whatsapp_will_not_cache_stickers"
        private const val ANIMATED_STICKER_PACK = "animated_sticker_pack"
        private const val STICKER_FILE_NAME_IN_QUERY = "sticker_file_name"
        private const val STICKER_FILE_EMOJI_IN_QUERY = "sticker_emoji"
        private const val STICKER_FILE_ACCESSIBILITY_TEXT_IN_QUERY = "sticker_accessibility_text"
    }
}
