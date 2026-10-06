package com.saraha.brain

import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import org.json.JSONObject

class WebFallback {
    fun search(query: String): String? = try {
        val u = URL("https://api.duckduckgo.com/?q=" +
            URLEncoder.encode(query, "UTF-8") + "&format=json&no_html=1")
        val c = u.openConnection() as HttpURLConnection
        c.connectTimeout = 6000
        c.readTimeout = 8000
        c.requestMethod = "GET"
        val text = c.inputStream.bufferedReader().use { it.readText() }
        c.disconnect()
        val o = JSONObject(text)
        val abstractText = o.optString("AbstractText")
        if (abstractText.isNotBlank()) abstractText else null
    } catch (_: Exception) { null }
}
