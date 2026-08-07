---
'@core-ai/core-ai': minor
---

Add `modalities.imageInput` to `ModelCapabilities` as a boolean describing whether a model accepts image parts. The new `validateImageInput` helper is exported so callers can pre-flight the same check that provider adapters now run before a request is sent. It takes a single `ValidateImageInputOptions` object (`messages`, `capabilities`, `modelId`, `providerId`).

`modalities` is required, so custom `ChatModel` implementations and custom `ModelCapabilitiesRegistry` values must add it.
