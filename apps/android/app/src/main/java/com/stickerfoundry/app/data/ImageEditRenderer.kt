package com.stickerfoundry.app.data

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Typeface

object ImageEditRenderer {
    fun render(source: Bitmap, options: ImageEditOptions): Bitmap {
        val cropped = if (options.cropSquare) {
            val baseSize = minOf(source.width, source.height)
            val size = (baseSize / options.zoom.coerceAtLeast(1f)).toInt().coerceAtLeast(1)
            val maxX = source.width - size
            val maxY = source.height - size
            val x = ((maxX / 2f) + (maxX / 2f) * (options.offsetX.coerceIn(-100f, 100f) / 100f))
                .toInt()
                .coerceIn(0, maxX)
            val y = ((maxY / 2f) + (maxY / 2f) * (options.offsetY.coerceIn(-100f, 100f) / 100f))
                .toInt()
                .coerceIn(0, maxY)
            Bitmap.createBitmap(source, x, y, size, size)
        } else {
            source
        }

        val rotation = options.rotationDegrees.floorMod(360)
        val rotated = if (rotation == 0) {
            cropped
        } else {
            val matrix = Matrix().apply { postRotate(rotation.toFloat()) }
            Bitmap.createBitmap(cropped, 0, 0, cropped.width, cropped.height, matrix, true)
        }
        val colorAdjusted = applyColorAdjustments(rotated, options)
        return drawTextOverlay(colorAdjusted, options)
    }

    private fun applyColorAdjustments(bitmap: Bitmap, options: ImageEditOptions): Bitmap {
        if (!options.hasColorEdits()) return bitmap

        val output = Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.ARGB_8888)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            colorFilter = ColorMatrixColorFilter(options.colorMatrix())
        }
        Canvas(output).drawBitmap(bitmap, 0f, 0f, paint)
        return output
    }

    private fun drawTextOverlay(bitmap: Bitmap, options: ImageEditOptions): Bitmap {
        if (!options.hasTextEdit()) return bitmap

        val output = bitmap.copy(Bitmap.Config.ARGB_8888, true)
        val canvas = Canvas(output)
        val scale = maxOf(output.width, output.height) / 512f
        val textSize = options.textSize.coerceIn(18f, 140f) * scale
        val x = output.width / 2f
        val y = output.height * 0.84f
        val text = options.textContent.trim().take(80)
        val strokeWidth = maxOf(3f, textSize * 0.1f)

        val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            style = Paint.Style.STROKE
            this.strokeWidth = strokeWidth
            this.textSize = textSize
            textAlign = Paint.Align.CENTER
            typeface = Typeface.DEFAULT_BOLD
        }
        val fillPaint = Paint(strokePaint).apply {
            color = Color.WHITE
            style = Paint.Style.FILL
        }

        canvas.drawText(text, x, y, strokePaint)
        canvas.drawText(text, x, y, fillPaint)
        return output
    }

    private fun ImageEditOptions.colorMatrix(): ColorMatrix {
        val saturationValue = if (grayscale) 0f else (1f + saturation / 100f).coerceIn(0f, 2f)
        val contrastValue = (1f + contrast / 100f).coerceIn(0f, 2f)
        val brightnessValue = brightness.coerceIn(-100f, 100f) * 2.55f
        val translate = ((-0.5f * contrastValue + 0.5f) * 255f) + brightnessValue

        val matrix = ColorMatrix().apply { setSaturation(saturationValue) }
        val contrastMatrix = ColorMatrix(
            floatArrayOf(
                contrastValue,
                0f,
                0f,
                0f,
                translate,
                0f,
                contrastValue,
                0f,
                0f,
                translate,
                0f,
                0f,
                contrastValue,
                0f,
                translate,
                0f,
                0f,
                0f,
                1f,
                0f,
            ),
        )
        matrix.postConcat(contrastMatrix)
        return matrix
    }

    private fun Int.floorMod(divisor: Int): Int = ((this % divisor) + divisor) % divisor
}
