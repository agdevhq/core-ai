---
'@core-ai/core-ai': minor
---

Add structured `ProviderError` subclasses (`ContextLengthExceededError`, `RateLimitError`, `ModelOverloadedError`, `ServiceUnavailableError`) with a `RetryableProviderError` base for transient failures. Providers decide which subclass to throw; core exports shared extraction helpers only, including `retry-after-ms` and HTTP-date `Retry-After` parsing.
