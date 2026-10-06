package com.saraha.brain

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

        val hasDataset = DatasetStore(this).exists()
        status.text = "Offline-first • ARMv7a • dataset " + if (hasDataset) "ready" else "missing"

        findViewById<Button>(R.id.send).setOnClickListener {
            val q = input.text.toString().trim()
            if (q.isEmpty()) return@setOnClickListener
            chat.append("\n\nYou: $q")
            input.setText("")
            Thread {
                val answer = engine.answer(q)
                runOnUiThread { chat.append("\nSara: $answer") }
            }.start()
        }
    }
}
