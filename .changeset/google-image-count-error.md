---
'@core-ai/google-genai': patch
---

Classify the Gemini API image-count limit (`Please use fewer than 3600 images in your request to models/…`) as `ImageCountExceededError` instead of a generic `ProviderError`.
