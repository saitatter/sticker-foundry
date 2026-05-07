package com.example.stickerplatform.data

import android.content.Context
import com.squareup.moshi.Moshi
import java.io.File
import java.util.zip.ZipInputStream

class ZipExtractor(
    private val context: Context,
    private val moshi: Moshi,
) {
    fun extract(packId: String, zipBytes: ByteArray): ExtractedPack {
        val packDir = File(context.filesDir, "packs/$packId")
        if (packDir.exists()) {
            packDir.deleteRecursively()
        }
        packDir.mkdirs()

        ZipInputStream(zipBytes.inputStream()).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                val target = File(packDir, entry.name).canonicalFile
                require(target.path.startsWith(packDir.canonicalPath)) { "Unsafe zip entry: ${entry.name}" }
                if (entry.isDirectory) {
                    target.mkdirs()
                } else {
                    target.parentFile?.mkdirs()
                    target.outputStream().use { out -> zip.copyTo(out) }
                }
            }
        }

        val contentsFile = File(packDir, "contents.json")
        val contents = moshi.adapter(ContentsJson::class.java).fromJson(contentsFile.readText())
            ?: error("Invalid contents.json")
        val pack = contents.stickerPacks.first()

        return ExtractedPack(
            entity = PackEntity(
                id = pack.identifier,
                name = pack.name,
                publisher = pack.publisher,
                trayImageFile = pack.trayImageFile,
                imageDataVersion = pack.imageDataVersion,
                syncHash = "",
                localPath = packDir.absolutePath,
                isPublic = true,
                isAnimated = pack.animatedStickerPack == true,
                isOwner = false,
                teamId = null,
                teamName = null,
                role = "VIEWER",
                canEdit = false,
                canManage = false,
                stickerCount = pack.stickers.size,
                updatedAt = System.currentTimeMillis().toString(),
            ),
            stickers = pack.stickers.map {
                StickerEntity(
                    packId = pack.identifier,
                    fileName = it.imageFile,
                    emojisCsv = it.emojis.take(3).joinToString(","),
                    accessibilityText = it.accessibilityText,
                )
            },
        )
    }
}

data class ExtractedPack(
    val entity: PackEntity,
    val stickers: List<StickerEntity>,
)
