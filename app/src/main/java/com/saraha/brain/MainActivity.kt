package com.saraha.brain

import android.os.Bundle
import android.widget.*
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var engine: BrainEngine

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        engine = BrainEngine(this)
        val input = findViewById<EditText>(R.id.input)
        val chat = findViewById<TextView>(R.id.chat)
        findViewById<Button>(R.id.send).setOnClickListener {
            val q = input.text.toString().trim()
            if (q.isEmpty()) return@setOnClickListener
            chat.append("\n\nYou: $q")
            Thread {
                val answer = engine.answer(q)
                runOnUiThread { chat.append("\nSara: $answer"); input.setText("") }
            }.start()
        }
    }
}
