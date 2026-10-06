package com.saraha.brain

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.util.Locale
import kotlin.math.max

class DatasetStore(private val context: Context) {
    private val file = File(context.filesDir, "dataset.jsonl")

    fun best(query: String): String? {
        if (!file.exists()) return null
        val q = tokens(query)
        if (q.isEmpty()) return null
        var best = 0.0
        var answer: String? = null
        file.forEachLine { line ->
            try {
                val o = JSONObject(line)
                val score = jaccard(q, tokens(o.optString("question") + " " + o.optString("tags")))
                if (score > best) {
                    best = score
                    answer = o.optString("answer").takeIf { it.isNotBlank() }
                }
            } catch (_: Exception) {}
        }
        return if (best >= 0.55) answer else null
    }

    fun exists() = file.exists()

    private fun tokens(s: String): Set<String> =
        s.lowercase(Locale.ROOT).split(Regex("[^\p{L}\p{N}]+"))
            .filter { it.length > 1 }.toSet()

    private fun jaccard(a: Set<String>, b: Set<String>): Double {
        if (a.isEmpty() || b.isEmpty()) return 0.0
        return a.intersect(b).size.toDouble() / max(1, a.union(b).size)
    }
}
