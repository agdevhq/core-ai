---
'@core-ai/core-ai': minor
---

Add `MediaCountExceededError` and its subclass `ImageCountExceededError`, non-retryable `ProviderError`s for requests that carry more media inputs (images, document pages) or more images than the provider or model accepts. Both expose `maxMedia` / `actualMedia` when the provider reports them.
