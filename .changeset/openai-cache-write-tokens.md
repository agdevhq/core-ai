---
'@core-ai/openai': patch
---

Map `cache_write_tokens` into `usage.inputTokenDetails.cacheWriteTokens` for the Responses API and Chat Completions, including streaming usage chunks. `inputTokens` stays inclusive of cache reads and writes. Responses that omit the field still report `0`.
