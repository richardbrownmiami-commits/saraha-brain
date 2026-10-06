package com.saraha.brain

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

object HuggingFaceDownloader {
    fun downloadDataset(context: Context, url: String = HuggingFaceConfig.DATASET_URL) =
        if (url.contains("YOUR_USER")) false else download(url, File(context.filesDir, "dataset.jsonl"))

    fun downloadModel(context: Context, url: String = HuggingFaceConfig.MODEL_URL) =
        if (url.contains("YOUR_USER")) false else download(url, File(context.filesDir, "model.tflite"))

    private fun download(url: String, target: File): Boolean {
        if (url.isBlank()) return false
        return try {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 10000; c.readTimeout = 30000; c.requestMethod = "GET"; c.connect()
        if (c.responseCode !in 200..299) return false
        val tmp = File(target.parentFile, target.name + ".part")
        c.inputStream.use { input -> tmp.outputStream().use { output -> input.copyTo(output, 8192) } }
        if (target.exists()) target.delete()
        tmp.renameTo(target); c.disconnect(); true
    } catch (_: Exception) { false }
    }
}
