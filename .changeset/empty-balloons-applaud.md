---
'@core-ai/core-ai': minor
---

Refactor the core `ChatUsage` contract to nested detail objects for input and
output token accounting.

This is a breaking change:
- remove `usage.totalTokens`
- move `usage.reasoningTokens` to `usage.outputTokenDetails.reasoningTokens`
- add `usage.inputTokenDetails.{cacheReadTokens,cacheWriteTokens}`

Consumers should update any direct usage-field access to the new nested shape.
