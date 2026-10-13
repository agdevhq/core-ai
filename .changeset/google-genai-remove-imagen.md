---
'@core-ai/google-genai': minor
---

Remove Imagen support. Google retired Imagen on the Gemini API and Vertex AI, so `imageModel()` now sends every model id, including aliases such as `nano-banana-pro-preview`, through Gemini native image generation. Image provider options are now `aspectRatio`, `imageSize`, and `seed`; the Imagen-only options (`negativePrompt`, `guidanceScale`, `outputGcsUri`, `safetyFilterLevel`, `personGeneration`, `includeSafetyAttributes`, `includeRaiReason`, `language`, `outputMimeType`, `outputCompressionQuality`, `addWatermark`, `labels`, `enhancePrompt`) are rejected.
