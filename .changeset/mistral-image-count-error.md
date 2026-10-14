---
'@core-ai/mistral': patch
---

Classify the image-count limit (`Total number of images exceeds the maximum allowed of 8.`) as `ImageCountExceededError` instead of a generic `ProviderError`.
