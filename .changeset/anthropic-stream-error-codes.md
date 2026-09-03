---
'@core-ai/anthropic': minor
---

Wrap in-band stream errors as typed provider errors and expose the Anthropic error type as `ProviderError.code`. In-band `api_error` and `timeout_error`, which arrive without an HTTP status, now become a retryable `ServiceUnavailableError`.
