---
'@core-ai/mistral': minor
---

Update Mistral usage mapping to the new nested `ChatUsage` structure.

Mistral usage now reports cache and reasoning details in nested fields with zero
defaults:
- `usage.inputTokenDetails.cacheReadTokens = 0`
- `usage.inputTokenDetails.cacheWriteTokens = 0`
- `usage.outputTokenDetails.reasoningTokens = 0`

`usage.totalTokens` and top-level `usage.reasoningTokens` are no longer returned.
