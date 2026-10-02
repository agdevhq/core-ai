---
'@core-ai/anthropic-vertex': minor
---

**Breaking:** `defaultMaxTokens` no longer defaults to 4,096. Requests that omit
`maxTokens` use the model's output ceiling, and `generate()` streams
internally. Manual thinking budgets throw `ValidationError` when `maxTokens`
cannot hold them instead of being shrunk.
