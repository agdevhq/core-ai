---
'@core-ai/anthropic': patch
---

Classify the media-count limit (`too many images and documents: 110 + 0 > 100` and `Too much media: 0 document pages + 102 images > 100`) as `ImageCountExceededError` when the request contains images. A documents-only overflow stays a generic `ProviderError`.
