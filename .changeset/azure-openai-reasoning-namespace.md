---
'@core-ai/azure-openai': minor
---

Store Responses encrypted reasoning under `azure-openai` instead of `openai`. Read metadata with `getProviderMetadata(..., 'azure-openai')` — the previous `'openai'` key no longer matches new Azure turns. On Azure continuation, foreign `providerMetadata.openai` ciphertext is downgraded to thinking text. Pre-fix Azure turns that still store ciphertext under `openai` look owned to first-party OpenAI and can still 400 until those parts are stripped or regenerated.
