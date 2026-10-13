---
'@core-ai/core-ai': minor
---

Add `ImageCountExceededError`, a non-retryable `ProviderError` for requests that carry more images than the provider or model accepts. It exposes `maxImages` and `actualImages` when the provider reports them.
