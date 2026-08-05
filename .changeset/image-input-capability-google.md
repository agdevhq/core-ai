---
'@core-ai/google-genai': minor
---

Report image input support in model capabilities. Every Gemini model accepts `base64` and `url` image sources, and the adapter validates image parts against the capability before calling the API.
