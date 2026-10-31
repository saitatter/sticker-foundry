package com.stickerfoundry.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayOutputStream
import java.util.ArrayDeque
import java.util.concurrent.Executors

/** Reads only documents selected through Android's system folder picker. */
class FolderImportBridge(private val activity: Activity) {
    private val executor = Executors.newSingleThreadExecutor()
    private var pending: MethodChannel.Result? = null
    private val permitted = mutableSetOf<String>()
    private val extensions = setOf("webp", "png", "jpg", "jpeg", "gif", "avif")
    private val request = 7130

    fun handles(method: String) = method in setOf("pickImportFolder", "readImportFile")

    fun handle(call: MethodCall, result: MethodChannel.Result) {
        if (call.method == "pickImportFolder") {
            if (pending != null) { result.error("FOLDER", "A folder picker is already open", null); return }
            pending = result
            try {
                activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), request)
            } catch (e: Exception) { pending = null; result.error("FOLDER", e.message, null) }
        } else executor.execute {
            try {
                val uri = call.argument<String>("uri") ?: error("Missing document")
                require(permitted.contains(uri)) { "Choose this file through the folder picker first" }
                val bytes = activity.contentResolver.openInputStream(Uri.parse(uri))?.use { input ->
                    val output = ByteArrayOutputStream()
                    val buffer = ByteArray(8192)
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        require(output.size() + n <= 10 * 1024 * 1024) { "Image exceeds 10 MB" }
                        output.write(buffer, 0, n)
                    }
                    output.toByteArray()
                } ?: error("The selected image is no longer available")
                activity.runOnUiThread { result.success(bytes) }
            } catch (e: Exception) { activity.runOnUiThread { result.error("FOLDER", e.message, null) } }
        }
    }

    fun onResult(code: Int, resultCode: Int, data: Intent?): Boolean {
        if (code != request) return false
        val result = pending ?: return true
        pending = null
        val tree = data?.data
        if (resultCode != Activity.RESULT_OK || tree == null) { result.success(null); return true }
        executor.execute {
            try {
                permitted.clear()
                val files = mutableListOf<Map<String, Any>>()
                val directories = ArrayDeque<String>()
                val visited = mutableSetOf<String>()
                directories.add(DocumentsContract.getTreeDocumentId(tree))
                var examined = 0
                while (directories.isNotEmpty() && examined < 2000 && files.size < 200) {
                    val id = directories.removeFirst()
                    if (!visited.add(id)) continue
                    val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, id)
                    activity.contentResolver.query(children, arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_SIZE), null, null, null)?.use { cursor ->
                        while (examined < 2000 && files.size < 200 && cursor.moveToNext()) {
                            examined++
                            val childId = cursor.getString(0)
                            val name = cursor.getString(1) ?: continue
                            if (cursor.getString(2) == DocumentsContract.Document.MIME_TYPE_DIR) directories.add(childId)
                            else if (name.substringAfterLast('.', "").lowercase() in extensions) {
                                val uri = DocumentsContract.buildDocumentUriUsingTree(tree, childId).toString()
                                permitted.add(uri)
                                files.add(mapOf("name" to name, "uri" to uri, "size" to cursor.getLong(3)))
                            }
                        }
                    } ?: error("This folder cannot be read. Try copying the images to Downloads.")
                }
                activity.runOnUiThread { result.success(mapOf("files" to files, "limited" to (examined >= 2000 || files.size >= 200))) }
            } catch (e: Exception) { activity.runOnUiThread { result.error("FOLDER", e.message, null) } }
        }
        return true
    }
}
