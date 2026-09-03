---
'@core-ai/anthropic': patch
---

Wrap in-band stream errors as typed provider errors and expose the Anthropic error type as `ProviderError.code`.
