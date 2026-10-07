package com.saraha.brain

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

object HuggingFaceDownloader {
    fun downloadDataset(context: Context, url: String): Boolean {
        if (url.isBlank()) return false
        val dir = File(context.filesDir, "datasets").apply { mkdirs() }
        val name = "hf_dataset_${System.currentTimeMillis()}.jsonl"
        return download(url, File(dir, name))
    }

    fun downloadModel(context: Context, url: String): Boolean =
        if (url.isBlank()) false else download(url, File(context.filesDir, "model.tflite"))

    private fun download(url: String, target: File): Boolean {
        return try {
            val c = URL(url).openConnection() as HttpURLConnection
            c.connectTimeout = 10000
            c.readTimeout = 30000
            c.requestMethod = "GET"
            c.connect()
            if (c.responseCode !in 200..299) { c.disconnect(); return false }
            val tmp = File(target.parentFile, target.name + ".part")
            c.inputStream.use { input -> tmp.outputStream().use { output -> input.copyTo(output, 8192) } }
            if (target.exists()) target.delete()
            tmp.renameTo(target)
            c.disconnect()
            true
        } catch (_: Exception) { false }
    }
}
