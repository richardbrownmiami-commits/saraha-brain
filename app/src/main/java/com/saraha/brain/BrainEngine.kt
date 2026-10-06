package com.saraha.brain

import android.content.Context
import android.content.SharedPreferences

class BrainEngine(context: Context) {
    private val dataset = DatasetStore(context)
    private val tools = ToolRouter(context)
    private val web = WebFallback()
    private val memory: SharedPreferences =
        context.getSharedPreferences("brain_memory", Context.MODE_PRIVATE)

    fun answer(question: String): String {
        val q = question.trim()
        if (q.isEmpty()) return "Ask me something."

        dataset.best(q)?.let { return it }
        tools.handle(q)?.let {
            remember(q, it)
            return it
        }
        web.search(q)?.let {
            remember(q, it)
            return it
        }
        return "No local dataset match was found and the internet fallback returned no usable result."
    }

    private fun remember(question: String, answer: String) {
        memory.edit().putString("last_" + System.currentTimeMillis(), "$question\n$answer").apply()
    }
}
