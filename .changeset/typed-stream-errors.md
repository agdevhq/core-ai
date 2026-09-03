---
'@core-ai/core-ai': patch
---

Add `ProviderError.code` so adapters can lift the provider's machine-readable error identifier, and `createChatStream({ mapError })` so in-band stream failures use the same typed errors as the initial request.
