---
'@core-ai/core-ai': minor
---

Add `MediaCountExceededError` and its subclass `ImageCountExceededError`, non-retryable `ProviderError`s for requests that carry more media inputs (images, document pages) or more images than the provider or model accepts. They expose `maxMedia` / `actualMedia` and `maxImages` / `actualImages` when the provider reports them.
