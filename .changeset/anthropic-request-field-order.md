---
'@core-ai/anthropic': patch
---

Serialize Messages API request bodies in a cache-friendly key order: after `model` come `system`, `tools` and `messages`, followed by per-request settings (`tool_choice`, `max_tokens`, thinking and output config, sampling and cache options). The API treats every order the same, but gateways that route prompt-cache lookups by the leading bytes of the body now see an identical prefix across turns and agent steps, even when a setting changes between them.
