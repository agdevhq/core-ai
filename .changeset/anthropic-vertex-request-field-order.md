---
'@core-ai/anthropic-vertex': patch
---

Improve prompt-cache hit rates on Vertex AI multi-region (`eu`, `us`) and `global` endpoints, which were observed to route requests by the leading bytes of the body. Request bodies now start with `tools`, `system` and `messages`, the order Anthropic caches them in, with per-request settings after them. Before, every body started with the conversation, so extended requests were often routed to a region without the cache entry and rewrote the whole prefix.
