---
'@core-ai/openai': patch
---

Add model capability support for `gpt-6.2-sol-healthcare` and `gpt-6.1-sol-healthcare`. The models reason by default and accept `low` through `max` effort, with `max` sent as `max` and `minimal` clamped to `low`. `none` is unsupported. `temperature` and `topP` are rejected while reasoning is enabled. Tool calling requires the Responses API; Chat Completions requests that include tools are rejected.
