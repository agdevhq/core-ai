---
'@core-ai/openai': minor
---

Map OpenAI / Azure / OpenAI-compatible SDK failures to structured `ProviderError` subclasses in `wrapOpenAIError`, including non-retryable `insufficient_quota` and Azure `NoCapacity` overload.
