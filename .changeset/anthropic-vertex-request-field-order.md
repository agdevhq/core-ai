---
'@core-ai/anthropic-vertex': patch
---

Restore prompt-cache hits on Vertex AI multi-region (`eu`, `us`) and `global` endpoints. Request bodies now start with `system`, `tools` and `tool_choice`, followed by per-request settings, and end with `messages`. Before, every body started with the conversation, so extended requests were often routed to a region without the cache entry and rewrote the whole prefix.
