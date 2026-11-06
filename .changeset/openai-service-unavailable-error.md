---
'@core-ai/openai': patch
---

Treat the error code `service_unavailable_error` as a transient failure, so it surfaces as `ServiceUnavailableError` instead of a plain `ProviderError`.
