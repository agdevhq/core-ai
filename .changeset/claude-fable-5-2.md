---
'@core-ai/anthropic': patch
---

Add model capability support for `claude-fable-5-2` and `claude-mythos-5-2`. Adaptive thinking is always on and accepts `max` effort. Forced tool choice and non-default sampling parameters are rejected on every request. The output ceiling is 128,000 tokens.
