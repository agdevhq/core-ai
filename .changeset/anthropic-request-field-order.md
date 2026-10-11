---
'@core-ai/anthropic': patch
---

Serialize Messages API request bodies in a cache-friendly key order: `system`, `tools` and `tool_choice` first, then per-request settings (`max_tokens`, thinking and output config, sampling and cache options), then `messages`. The API treats every order the same, but gateways that route prompt-cache lookups by the leading bytes of the body now see an identical prefix across turns and agent steps.
