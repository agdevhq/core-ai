---
'@core-ai/google-genai': minor
---

Report image input support in model capabilities. Every Gemini model reports `modalities.imageInput: true`, and the adapter validates image parts against the capability before calling the API.
