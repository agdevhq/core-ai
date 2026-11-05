---
'@core-ai/mistral': patch
---

Map network failures, such as a connection that drops mid-stream, to a retryable `ServiceUnavailableError` instead of a bare `TypeError` or an unclassified `ProviderError`. The network error code is available as `code`.
