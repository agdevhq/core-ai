---
'@core-ai/core-ai': minor
---

Add `ModelCapabilities.input` with `maxImages` and an optional `maxMedia`: the most images (and, where they share one limit, images plus document pages) a model accepts in one request. It is present only when the provider has a verified limit for the model id on the host it serves, so read it to trim or batch images before sending.
