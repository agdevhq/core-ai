---
'@core-ai/anthropic': patch
---

Serialize Messages API request bodies with the stable prompt prefix (`system`, `tools`, `tool_choice`, thinking and output config, sampling and cache options) before `messages`. The API treats both orders the same, but proxies and gateways that route prompt-cache lookups by the leading bytes of the body now see an identical prefix across turns and agent steps.
