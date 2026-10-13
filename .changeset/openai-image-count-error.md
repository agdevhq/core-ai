---
'@core-ai/openai': patch
---

Classify the image-count limit (`Exceeded maximum number of images (50) allowed in the request.` and `Too many images in request: 20, maximum allowed: 10.`) as `ImageCountExceededError` instead of a generic `ProviderError`.
