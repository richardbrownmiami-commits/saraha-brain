package com.saraha.brain

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

object NetworkTools {
    private fun get(url: String): String? = try {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 5000; c.readTimeout = 7000; c.requestMethod = "GET"
        val body = c.inputStream.bufferedReader().use { it.readText() }
        c.disconnect(); body
    } catch (_: Exception) { null }

    fun weather(city: String): String? {
        val geo = get("https://geocoding-api.open-meteo.com/v1/search?name=" +
            URLEncoder.encode(city, "UTF-8") + "&count=1&language=en&format=json") ?: return null
        val results = JSONObject(geo).optJSONArray("results") ?: return null
        if (results.length() == 0) return null
        val p = results.getJSONObject(0)
        val lat = p.getDouble("latitude"); val lon = p.getDouble("longitude")
        val place = p.optString("name", city)
        val data = get("https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m") ?: return null
        val cur = JSONObject(data).getJSONObject("current")
        return "${place}: ${cur.optDouble("temperature_2m")}°C, humidity ${cur.optInt("relative_humidity_2m")}%."
    }

    fun news(query: String): String? {
        val url = "https://api.gdeltproject.org/api/v2/doc/doc?query=" +
            URLEncoder.encode(query.ifBlank { "latest news" }, "UTF-8") +
            "&mode=ArtList&maxrecords=5&format=json"
        val raw = get(url) ?: return null
        val articles = JSONObject(raw).optJSONArray("articles") ?: return null
        if (articles.length() == 0) return null
        val out = StringBuilder("Latest results:\n")
        for (i in 0 until minOf(5, articles.length())) out.append("• ")
            .append(articles.getJSONObject(i).optString("title")).append("\n")
        return out.toString().trim()
    }
}
