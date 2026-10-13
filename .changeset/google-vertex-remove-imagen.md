---
'@core-ai/google-vertex': minor
---

Remove Imagen support. Google retired Imagen on Vertex AI, so `imageModel()` now uses Gemini native image generation for every model id. `GoogleVertexImageProviderOptions` now accepts `aspectRatio`, `imageSize`, and `seed`; the Imagen-only options are rejected.
