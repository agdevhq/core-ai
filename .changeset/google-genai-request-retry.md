---
'@core-ai/google-genai': minor
---

Retry chat requests that fail transiently before the response starts, matching the default of the OpenAI and Anthropic SDKs. Rate limits, overload, 5xx and network failures are retried up to 2 times with exponential backoff, or after the provider's `Retry-After` when it is at most 20 seconds. An abort stops the retries immediately, and errors raised after a stream has started are never retried. Configure with the new `maxRetries` provider option (`0` disables). Network failures without an HTTP status (socket reset, fetch headers/body timeout) now map to `ServiceUnavailableError` instead of a generic `ProviderError`.
