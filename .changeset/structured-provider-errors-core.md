---
'@core-ai/core-ai': minor
---

Add classified `ProviderError` codes and subclasses (`ContextLengthExceededError`, `RateLimitError`, `ModelOverloadedError`, `ServiceUnavailableError`) with an `isRetryable` signal, plus shared `classifyProviderError` helpers so all providers use one precedence order.
