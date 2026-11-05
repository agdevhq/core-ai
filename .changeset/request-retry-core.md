---
'@core-ai/core-ai': minor
---

Add `withRequestRetry`, which retries a provider request that fails with a `RetryableProviderError` before the response starts, and `DEFAULT_MAX_RETRIES`, the default used by providers whose SDK does not retry on its own.
