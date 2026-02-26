---
'@core-ai/anthropic': minor
---

Update Anthropic usage mapping to the new nested `ChatUsage` structure and
normalize cache accounting semantics.

Anthropic now reports:
- total `usage.inputTokens` as `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`
- `usage.inputTokenDetails.cacheReadTokens` from `cache_read_input_tokens`
- `usage.inputTokenDetails.cacheWriteTokens` from `cache_creation_input_tokens`
- `usage.outputTokenDetails.reasoningTokens` as `0`

`usage.totalTokens` and top-level `usage.reasoningTokens` are no longer returned.
