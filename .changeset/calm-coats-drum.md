---
'@core-ai/openai': minor
---

Update OpenAI usage mapping to the new nested `ChatUsage` structure.

OpenAI responses now map cache and reasoning metrics into:
- `usage.inputTokenDetails.cacheReadTokens` from `prompt_tokens_details.cached_tokens`
- `usage.outputTokenDetails.reasoningTokens` from `completion_tokens_details.reasoning_tokens`

`usage.totalTokens` and top-level `usage.reasoningTokens` are no longer returned.
