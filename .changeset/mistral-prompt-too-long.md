---
'@core-ai/mistral': patch
---

Map the error type `invalid_request_prompt_too_long` to `ContextLengthExceededError`, so an oversized prompt no longer surfaces as a plain `ProviderError`.
