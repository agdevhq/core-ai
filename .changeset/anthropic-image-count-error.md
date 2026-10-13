---
'@core-ai/anthropic': patch
---

Classify the media-count limit (`too many images and documents: 110 + 0 > 100` and `Too much media: 0 document pages + 102 images > 100`) as `ImageCountExceededError` when removing images can fix the request: it contains images and its documents fit the limit on their own. Images and documents share one limit, so `maxImages` is the limit minus the documents in the request. An overflow that documents cause on their own stays a generic `ProviderError`.
