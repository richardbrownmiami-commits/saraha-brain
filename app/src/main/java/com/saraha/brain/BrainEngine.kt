package com.saraha.brain

import android.content.Context
import java.text.SimpleDateFormat
import java.util.*
import java.util.regex.Pattern

class BrainEngine(private val context: Context) {
    private val dataset = DatasetStore(context)
    private val tools = ToolRouter(context)
    private val web = WebFallback()

    fun answer(question: String): String {
        val q = question.trim()
        dataset.best(q)?.let { return it }
        tools.handle(q)?.let { return it }
        return web.search(q) ?: "I don't have an answer in the local dataset, and the internet fallback did not return usable context."
    }
}
