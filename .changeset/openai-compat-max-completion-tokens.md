---
'@core-ai/openai': patch
---

Map `maxTokens` to `max_completion_tokens` for known GPT-5 and o-series models when using strict Chat Completions. Unknown model IDs keep the broadly compatible `max_tokens` parameter.
