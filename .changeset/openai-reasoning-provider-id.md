---
'@core-ai/openai': patch
---

Namespace Responses API encrypted reasoning under each wrapper's `providerId` instead of always using `openai`, so foreign ciphertext is downgraded to thinking text on the next turn.
