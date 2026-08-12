---
'@core-ai/openai': minor
---

Namespace Responses API encrypted reasoning under each wrapper's `providerId` instead of always using `openai`. Foreign namespaces (e.g. `azure-openai`) downgrade to thinking text; same-namespace ciphertext still round-trips.
