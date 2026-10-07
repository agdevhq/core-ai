---
'@core-ai/anthropic': patch
---

Add model capability support for `claude-haiku-5-5`. Adaptive thinking accepts `max` effort, the output ceiling is 128,000 tokens, and non-default sampling parameters are rejected on every request. The only accepted explicit `topP` is `0.99`, and `temperature` and `topP` cannot be set together. Forced tool choice stays valid when reasoning is omitted.
