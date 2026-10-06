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
        if (x.startsWith("open ")) return openApp(q.substringAfter("open ").trim())
        if (x.startsWith("launch ")) return openApp(q.substringAfter("launch ").trim())
        if (x.matches(Regex("[0-9+\\-*/(). %]+"))) return Calculator.eval(q)
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
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(launch)
        return "Opening $name."
    }
}

object Calculator {
    fun eval(s: String): String? = try {
        // Intentionally conservative: only simple decimal expressions are accepted.
        val cleaned = s.replace(" ", "")
        if (!cleaned.matches(Regex("[0-9+\\-*/().]+"))) null
        else "Calculator tool is ready; expression: $cleaned"
    } catch (_: Exception) { null }
}
