---
'@core-ai/openai': patch
---

Add model capability support for `gpt-6-astra`, `gpt-6-sol`, and `gpt-6-luna`. These models reason by default and accept `low` through `max` effort, with `max` sent as `max` and `minimal` clamped to `low`. `temperature` and `topP` are rejected while reasoning is enabled. Chat Completions tool calling is unsupported on Astra; Sol and Luna accept it only when reasoning is disabled.
