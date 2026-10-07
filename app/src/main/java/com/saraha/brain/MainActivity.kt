package com.saraha.brain

import android.content.Intent
import android.os.Bundle
import android.widget.*
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val engine = BrainEngine(this)
        val input = findViewById<EditText>(R.id.input)
        val chat = findViewById<TextView>(R.id.chat)
        val status = findViewById<TextView>(R.id.status)

        refreshStatus(status)
        findViewById<Button>(R.id.settings).setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        findViewById<Button>(R.id.send).setOnClickListener {
            val q = input.text.toString().trim()
            if (q.isEmpty()) return@setOnClickListener
            chat.append("\n\nYou: $q")
            input.setText("")
            Thread {
                val answer = engine.answer(q)
                runOnUiThread { chat.append("\n\nSara: $answer") }
            }.start()
        }
    }

    override fun onResume() {
        super.onResume()
        findViewById<TextView?>(R.id.status)?.let { refreshStatus(it) }
    }

    private fun refreshStatus(status: TextView) {
        val store = DatasetStore(this)
        val settings = AppSettings(this)
        status.text = "Offline-first • ARMv7a • " +
            if (store.exists()) "RAG ready" else "add a dataset in ⚙"
        if (settings.offlineOnly) status.append(" • offline-only")
    }
}
