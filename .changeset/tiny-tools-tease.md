---
'@core-ai/google-genai': minor
---

Update Google GenAI usage mapping to the new nested `ChatUsage` structure.

Google GenAI responses now map:
- `usage.inputTokenDetails.cacheReadTokens` from `usageMetadata.cachedContentTokenCount`
- `usage.outputTokenDetails.reasoningTokens` from `usageMetadata.thoughtsTokenCount`

`usage.totalTokens` and top-level `usage.reasoningTokens` are no longer returned.
