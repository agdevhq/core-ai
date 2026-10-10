---
'@core-ai/anthropic-vertex': patch
---

Restore prompt-cache hits on Vertex AI multi-region (`eu`, `us`) and `global` endpoints. Request bodies now put the stable prompt prefix (`system`, `tools`, `tool_choice`, thinking and output config) before `messages`. Before, every body started with the conversation, so extended requests were often routed to a region without the cache entry and rewrote the whole prefix.
