---
'@core-ai/azure-openai': patch
---

Store Responses encrypted reasoning under `azure-openai` instead of `openai`, so Azure↔OpenAI history no longer replays undecryptable ciphertext. Existing Azure turns that still carry `providerMetadata.openai.encryptedContent` are downgraded to thinking text on continuation (same-provider encrypted round-trip resumes after new turns).
