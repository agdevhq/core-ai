---
'@core-ai/openai': patch
---

Map network failures, such as a connection that drops mid-stream or a request that times out, to a retryable `ServiceUnavailableError` instead of a bare `TypeError` or an unclassified `ProviderError`.
