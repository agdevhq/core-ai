---
'@core-ai/anthropic': patch
---

Classify the media-count limit (`too many images and documents: 110 + 0 > 100` and `Too much media: 0 document pages + 102 images > 100`) as `MediaCountExceededError`. Images and document pages share one limit, so `maxMedia` is that limit and `actualMedia` the sum of both counts.
