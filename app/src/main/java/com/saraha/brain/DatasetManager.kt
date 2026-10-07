package com.saraha.brain

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class DatasetManager(private val context: Context) {
    private val dir = File(context.filesDir, "datasets").apply { mkdirs() }
    private val settings = AppSettings(context)

    fun list(): List<File> = dir.listFiles { f -> f.isFile && f.extension == "jsonl" }
        ?.sortedBy { it.name.lowercase() } ?: emptyList()

    fun activeFile(): File? = settings.activeDataset.takeIf { it.isNotBlank() }?.let { File(dir, it) }
        ?.takeIf { it.exists() }

    fun setActive(file: File) {
        settings.activeDataset = file.name
    }

    fun delete(file: File): Boolean {
        if (settings.activeDataset == file.name) settings.activeDataset = ""
        return file.delete()
    }

    fun importText(name: String, text: String): File {
        val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "dataset" }
        val target = File(dir, safe.substringBeforeLast('.', safe) + ".jsonl")
        val lines = when {
            name.lowercase().endsWith(".jsonl") -> text.lineSequence()
                .mapNotNull { it.trim().takeIf(String::isNotBlank) }
            name.lowercase().endsWith(".json") -> jsonToLines(text)
            name.lowercase().endsWith(".csv") -> csvToLines(text)
            else -> text.lineSequence().filter { it.isNotBlank() }.map { line ->
                JSONObject().put("question", line).put("answer", line).toString()
            }
        }
        target.bufferedWriter().use { out -> lines.forEach { out.appendLine(it) } }
        if (settings.activeDataset.isBlank()) setActive(target)
        return target
    }

    private fun jsonToLines(text: String): Sequence<String> {
        val root = JSONArray(text)
        return sequence {
            for (i in 0 until root.length()) {
                val o = root.optJSONObject(i) ?: continue
                val q = o.optString("question", o.optString("prompt"))
                val a = o.optString("answer", o.optString("response"))
                if (q.isNotBlank() && a.isNotBlank()) yield(JSONObject().put("question", q).put("answer", a).put("tags", o.optString("tags")).toString())
            }
        }
    }

    private fun csvToLines(text: String): Sequence<String> {
        val rows = text.lineSequence().toList()
        if (rows.isEmpty()) return emptySequence()
        val header = splitCsv(rows.first()).map { it.trim().lowercase() }
        val qi = header.indexOfFirst { it in setOf("question", "prompt", "query", "input") }
        val ai = header.indexOfFirst { it in setOf("answer", "response", "output", "completion") }
        val start = if (qi >= 0 && ai >= 0) 1 else 0
        val qIndex = if (qi >= 0) qi else 0
        val aIndex = if (ai >= 0) ai else 1
        return rows.drop(start).asSequence().mapNotNull { row ->
            val c = splitCsv(row)
            if (c.size <= maxOf(qIndex, aIndex)) null
            else JSONObject().put("question", c[qIndex]).put("answer", c[aIndex]).toString()
        }
    }

    private fun splitCsv(line: String): List<String> {
        val out = mutableListOf<String>(); val cur = StringBuilder(); var quoted = false
        for (ch in line) when {
            ch == '"' -> quoted = !quoted
            ch == ',' && !quoted -> { out += cur.toString().trim(); cur.setLength(0) }
            else -> cur.append(ch)
        }
        out += cur.toString().trim()
        return out
    }
}
