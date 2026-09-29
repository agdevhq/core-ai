---
'@core-ai/anthropic': patch
---

Add model capability support for `claude-sonnet-5-5`, `claude-fable-5-1`, and `claude-mythos-5-1`. Adaptive thinking accepts `max` effort. On `claude-fable-5-1` and `claude-mythos-5-1`, adaptive thinking is always on. These models, along with `claude-opus-5-5`, reject forced tool choice and non-default sampling parameters on every request.
