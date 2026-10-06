package com.saraha.brain

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import java.text.SimpleDateFormat
import java.util.*

class ToolRouter(private val context: Context) {
    fun handle(q: String): String? {
        val x = q.lowercase(Locale.US)
        if (x.contains("time") || x.contains("what time")) {
            return SimpleDateFormat("h:mm a, EEEE, d MMMM", Locale.getDefault()).format(Date())
        }
        if (x.contains("weather")) {
            val city = Regex("weather(?: in| at| for)?\\s+(.+)", RegexOption.IGNORE_CASE)
                .find(q)?.groupValues?.getOrNull(1)?.trim() ?: return "Tell me the city for the weather."
            return NetworkTools.weather(city) ?: "I couldn't retrieve weather for $city."
        }
        if (x.contains("news")) {
            return NetworkTools.news(q.replace(Regex("(?i)\\b(news|today|latest)\\b"), "").trim())
                ?: "I couldn't retrieve current news."
        }
        if (x.startsWith("open ")) return openApp(q.substringAfter("open ").trim())
        if (x.startsWith("launch ")) return openApp(q.substringAfter("launch ").trim())
        return null
    }

    private fun openApp(name: String): String {
        val pm = context.packageManager
        val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
        val match = apps.firstOrNull { pm.getApplicationLabel(it).toString().equals(name, true) }
            ?: apps.firstOrNull { pm.getApplicationLabel(it).toString().contains(name, true) }
            ?: return "I couldn't find an installed app named $name."
        val launch = pm.getLaunchIntentForPackage(match.packageName)
            ?: return "I found $name, but Android does not expose a launch activity for it."
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); context.startActivity(launch)
        return "Opening $name."
    }
}
