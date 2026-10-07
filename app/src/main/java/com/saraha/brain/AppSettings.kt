package com.saraha.brain

import android.content.Context

class AppSettings(context: Context) {
    private val prefs = context.getSharedPreferences("app_settings", Context.MODE_PRIVATE)

    var localRag: Boolean
        get() = prefs.getBoolean("local_rag", true)
        set(value) = prefs.edit().putBoolean("local_rag", value).apply()

    var webFallback: Boolean
        get() = prefs.getBoolean("web_fallback", true)
        set(value) = prefs.edit().putBoolean("web_fallback", value).apply()

    var offlineOnly: Boolean
        get() = prefs.getBoolean("offline_only", false)
        set(value) = prefs.edit().putBoolean("offline_only", value).apply()

    var threshold: Float
        get() = prefs.getFloat("threshold", 0.55f)
        set(value) = prefs.edit().putFloat("threshold", value.coerceIn(0.1f, 0.95f)).apply()

    var activeDataset: String
        get() = prefs.getString("active_dataset", "") ?: ""
        set(value) = prefs.edit().putString("active_dataset", value).apply()

    var huggingFaceDatasetUrl: String
        get() = prefs.getString("hf_dataset_url", "") ?: ""
        set(value) = prefs.edit().putString("hf_dataset_url", value).apply()
}
