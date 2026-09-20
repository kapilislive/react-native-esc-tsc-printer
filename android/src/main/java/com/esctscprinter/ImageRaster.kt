package com.esctscprinter

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.util.Base64

internal object ImageRaster {
  data class Result(
    val widthBytes: Int,
    val height: Int,
    val data: ByteArray
  )

  fun rasterizeMono(base64Image: String, targetWidth: Int): Result {
    val decoded = Base64.decode(base64Image, Base64.DEFAULT)
    val bitmap = BitmapFactory.decodeByteArray(decoded, 0, decoded.size)
      ?: throw IllegalArgumentException("Unable to decode image")

    val width = ((targetWidth.coerceAtLeast(8) + 7) / 8) * 8
    val height = ((bitmap.height * width) / bitmap.width).coerceAtLeast(1)
    val scaled = Bitmap.createScaledBitmap(bitmap, width, height, true)
    val pixels = IntArray(width * height)
    scaled.getPixels(pixels, 0, width, 0, 0, width, height)

    val packed = ByteArray((width / 8) * height)
    var index = 0
    for (y in 0 until height) {
      for (xByte in 0 until width / 8) {
        var packedByte = 0
        for (bit in 0 until 8) {
          val x = xByte * 8 + bit
          val color = pixels[y * width + x]
          val gray =
            (Color.red(color) * 30 + Color.green(color) * 59 + Color.blue(color) * 11) / 100
          if (gray < 128) {
            packedByte = packedByte or (0x80 shr bit)
          }
        }
        packed[index] = packedByte.toByte()
        index += 1
      }
    }

    if (scaled !== bitmap) {
      scaled.recycle()
    }
    bitmap.recycle()

    return Result(width / 8, height, packed)
  }
}
