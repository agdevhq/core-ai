---
'@core-ai/openai': patch
---

Add model capability support for `gpt-6.2-astra-healthcare` and `gpt-6-astra-healthcare`. These models reason by default and accept `low` through `max` effort, with `max` sent as `max` and `minimal` clamped to `low`. `none` is unsupported. `temperature` and `topP` are rejected while reasoning is enabled. Tool calling requires the Responses API; Chat Completions requests that include tools are rejected.
