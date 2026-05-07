package com.example.stickerplatform.data

import android.content.Context
import com.squareup.moshi.Moshi
import java.io.File
import java.util.zip.ZipInputStream

class ZipExtractor(
    private val context: Context,
    private val moshi: Moshi,
) {
    fun extract(packId: String, zipFile: File): ExtractedPack {
        val packsRoot = File(context.filesDir, "packs").apply { mkdirs() }
        val packDir = File(packsRoot, packId)
        val tempDir = File(packsRoot, ".$packId.tmp-${System.currentTimeMillis()}")
        val backupDir = File(packsRoot, ".$packId.backup-${System.currentTimeMillis()}")
        tempDir.deleteRecursively()
        tempDir.mkdirs()
        var promoted = false

        try {
            ZipInputStream(zipFile.inputStream()).use { zip ->
                while (true) {
                    val entry = zip.nextEntry ?: break
                    val target = File(tempDir, entry.name).canonicalFile
                    val rootPath = tempDir.canonicalPath
                    require(target.path == rootPath || target.path.startsWith("$rootPath${File.separator}")) {
                        "Unsafe zip entry: ${entry.name}"
                    }
                    if (entry.isDirectory) {
                        target.mkdirs()
                    } else {
                        target.parentFile?.mkdirs()
                        target.outputStream().use { out -> zip.copyTo(out) }
                    }
                }
            }

            val contentsFile = File(tempDir, "contents.json")
            val contents = moshi.adapter(ContentsJson::class.java).fromJson(contentsFile.readText())
                ?: error("Invalid contents.json")
            val pack = contents.stickerPacks.first()
            require(pack.identifier == packId) { "ZIP pack id ${pack.identifier} does not match $packId" }

            if (packDir.exists() && !packDir.renameTo(backupDir)) {
                error("Cannot replace existing pack cache")
            }
            if (!tempDir.renameTo(packDir)) {
                if (!backupDir.renameTo(packDir)) {
                    error("Cannot promote downloaded pack cache; backup remains at ${backupDir.absolutePath}")
                }
                error("Cannot promote downloaded pack cache")
            }
            promoted = true

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
                    extractionStatus = EXTRACTION_READY,
                    extractionError = null,
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
        } finally {
            tempDir.deleteRecursively()
            if (promoted) {
                backupDir.deleteRecursively()
            }
        }
    }
}

data class ExtractedPack(
    val entity: PackEntity,
    val stickers: List<StickerEntity>,
)
