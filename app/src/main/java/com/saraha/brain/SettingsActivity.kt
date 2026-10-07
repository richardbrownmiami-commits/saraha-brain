package com.saraha.brain

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.*
import java.io.File

class SettingsActivity : Activity() {
    private lateinit var manager: DatasetManager
    private lateinit var settings: AppSettings
    private lateinit var datasetList: LinearLayout
    private lateinit var threshold: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        manager = DatasetManager(this)
        settings = AppSettings(this)

        findViewById<Button>(R.id.back).setOnClickListener { finish() }
        findViewById<Button>(R.id.importDataset).setOnClickListener { openDocument() }
        findViewById<Button>(R.id.downloadDataset).setOnClickListener { downloadHf() }
        findViewById<Button>(R.id.clearMemory).setOnClickListener {
            BrainEngine(this).clearMemory()
            Toast.makeText(this, "Memory cleared", Toast.LENGTH_SHORT).show()
        }

        findViewById<Switch>(R.id.localRag).apply {
            isChecked = settings.localRag
            setOnCheckedChangeListener { _, v -> settings.localRag = v }
        }
        findViewById<Switch>(R.id.webFallback).apply {
            isChecked = settings.webFallback
            setOnCheckedChangeListener { _, v -> settings.webFallback = v }
        }
        findViewById<Switch>(R.id.offlineOnly).apply {
            isChecked = settings.offlineOnly
            setOnCheckedChangeListener { _, v -> settings.offlineOnly = v }
        }

        threshold = findViewById(R.id.thresholdValue)
        val seek = findViewById<SeekBar>(R.id.thresholdSeek)
        seek.progress = ((settings.threshold - 0.1f) / 0.85f * 100).toInt()
        updateThreshold(seek.progress)
        seek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(s: SeekBar?, p: Int, fromUser: Boolean) { updateThreshold(p) }
            override fun onStartTrackingTouch(s: SeekBar?) = Unit
            override fun onStopTrackingTouch(s: SeekBar?) = Unit
        })

        datasetList = findViewById(R.id.datasetList)
        renderDatasets()
        val storage = findViewById<TextView>(R.id.storage)
        storage.text = "App storage: ${formatBytes(filesDir.walkTopDown().filter { it.isFile }.sumOf { it.length() })}"
    }

    private fun updateThreshold(progress: Int) {
        val value = 0.1f + progress.coerceIn(0, 100) / 100f * 0.85f
        settings.threshold = value
        threshold.text = "Retrieval threshold: %.2f".format(value)
    }

    private fun renderDatasets() {
        datasetList.removeAllViews()
        manager.list().forEach { file ->
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, 8, 0, 8) }
            val radio = RadioButton(this).apply {
                text = file.name
                isChecked = settings.activeDataset == file.name
                setOnClickListener { manager.setActive(file); renderDatasets() }
                layoutParams = LinearLayout.LayoutParams(0, -2, 1f)
            }
            val delete = Button(this).apply {
                text = "Delete"
                setOnClickListener { manager.delete(file); renderDatasets() }
            }
            row.addView(radio); row.addView(delete); datasetList.addView(row)
        }
        if (manager.list().isEmpty()) datasetList.addView(TextView(this).apply { text = "No datasets imported yet." })
    }

    private fun openDocument() {
        startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "application/jsonl", "text/plain", "text/csv", "text/*"))
        }, 42)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != 42 || resultCode != RESULT_OK) return
        val uri = data?.data ?: return
        try {
            val name = uri.lastPathSegment?.substringAfterLast('/') ?: "dataset.jsonl"
            val text = contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() } ?: return
            val file = manager.importText(name, text)
            manager.setActive(file)
            renderDatasets()
            Toast.makeText(this, "Imported ${file.name}", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, "Import failed: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun downloadHf() {
        val input = EditText(this).apply { hint = "Hugging Face direct file URL"; setSingleLine(true) }
        AlertDialogBuilder(this, input) { url ->
            settings.huggingFaceDatasetUrl = url
            Thread {
                val ok = HuggingFaceDownloader.downloadDataset(this, url)
                runOnUiThread {
                    Toast.makeText(this, if (ok) "Dataset downloaded" else "Download failed", Toast.LENGTH_SHORT).show()
                    renderDatasets()
                }
            }.start()
        }
    }

    private fun formatBytes(bytes: Long): String = when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> "%.1f KB".format(bytes / 1024f)
        else -> "%.1f MB".format(bytes / (1024f * 1024f))
    }

    private fun AlertDialogBuilder(activity: Activity, input: EditText, onOk: (String) -> Unit) {
        android.app.AlertDialog.Builder(activity).setTitle("Download dataset")
            .setMessage("Paste a direct downloadable dataset file URL.")
            .setView(input).setNegativeButton("Cancel", null)
            .setPositiveButton("Download") { _, _ -> onOk(input.text.toString().trim()) }.show()
    }
}
