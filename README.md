# Saraha Brain

Offline-first chatbot for Android 11 on ARMv7a (32-bit) with a 2 GB RAM target.

## Design
1. Dataset-first answers from a local JSONL dataset.
2. Local RAG using lightweight lexical retrieval.
3. Internet fallback only when the dataset has no sufficiently confident answer.
4. Deterministic tools: time, weather, news, calculator, and installed-app launcher.
5. Hugging Face dataset/model download support.
6. Persistent memory/preferences without retraining the base model.
7. Native ARMv7-compatible app structure.

The project deliberately does not assume an ARM64-only runtime. The generative model is loaded as an optional TensorFlow Lite artifact supplied by the user/Hugging Face. The app remains useful without the model by using dataset/tool responses.

## Dataset format
One JSON object per line:
{"question":"What is Saraha Brain?","answer":"...","tags":["about"]}

## Model format
Place or download a TensorFlow Lite encoder/decoder model as configured in `app/src/main/assets/model.json`. The runtime adapter is isolated so a model-specific tokenizer/generation implementation can be added without changing routing.

## Build
Use Android Studio with an Android 11-compatible SDK/NDK. Build only `armeabi-v7a`.
