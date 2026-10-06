# Saraha Brain

Offline-first chatbot foundation for Android 11 on ARMv7a (32-bit), targeting devices with 2 GB RAM.

## Current pipeline

```
user query
   ↓
local dataset retrieval
   ↓ miss
deterministic local/live tools
   ↓ miss
internet fallback
```

Dataset answers always win when their retrieval score passes the confidence threshold.

## Implemented

- Android application module
- `armeabi-v7a` ABI restriction
- Android 11 minimum/target
- Unicode-aware local JSONL retrieval
- Hugging Face dataset/model download hooks
- Time tool
- Weather tool using Open-Meteo
- News tool using GDELT
- Installed-app launcher
- Web fallback
- Persistent lightweight interaction memory
- No Python, Ollama, or cloud LLM is required for dataset/tool operation

## Dataset

Create `dataset.jsonl`, one JSON object per line:

{"question":"What is Saraha Brain?","answer":"An offline-first Android assistant.","tags":["about"]}

Put it in the app's private files directory as `dataset.jsonl`, or configure the downloader with a Hugging Face resolve URL.

## Model

The repository intentionally does not bundle an unverified model. A generative model must be both architecture-compatible and small enough for ARMv7a/2 GB RAM. The model layer should therefore be added only after selecting a concrete TFLite artifact and tokenizer.

## Important Android limitation

A normal Android application cannot freely execute arbitrary background work after the user force-stops it. For operation while the UI is closed, use an Android-supported mechanism such as a foreground service, notification action, widget, or shortcut. This repository currently focuses on the core assistant path rather than pretending force-stop bypass is possible.

## Build

Open the project in Android Studio and build the `armeabi-v7a` variant. The repository does not commit a Gradle wrapper binary; Android Studio can sync the Gradle project directly.

