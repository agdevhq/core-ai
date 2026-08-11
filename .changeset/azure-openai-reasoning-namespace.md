---
'@core-ai/openai': patch
'@core-ai/azure-openai': patch
'@core-ai/core-ai': patch
---

Namespace Azure OpenAI Responses encrypted reasoning under `azure-openai` instead of `openai`, so cross-provider history no longer replays undecryptable ciphertext.
