---
'@core-ai/mistral': minor
---

Map Mistral SDK failures to structured `ProviderError` subclasses in `wrapMistralError`, including service-tier capacity as unavailable and client timeouts as retryable unavailable.
