package com.saraha.brain

import android.content.Context
import org.json.JSONObject
import java.util.Locale
import kotlin.math.max

class DatasetStore(context: Context) {
    private val manager = DatasetManager(context)
    private val settings = AppSettings(context)

    fun best(query: String): String? {
        if (!settings.localRag) return null
        val file = manager.activeFile() ?: return null
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
            } catch (_: Exception) { }
        }
        return if (best >= settings.threshold) answer else null
    }

    fun exists(): Boolean = manager.activeFile()?.exists() == true

    private fun tokens(s: String): Set<String> =
        s.lowercase(Locale.ROOT).split(Regex("""[^\p{L}\p{N}]+"""))
            .filter { it.length > 1 }.toSet()

    private fun jaccard(a: Set<String>, b: Set<String>): Double {
        if (a.isEmpty() || b.isEmpty()) return 0.0
        return a.intersect(b).size.toDouble() / max(1, a.union(b).size)
    }
}
