---
'@core-ai/anthropic-vertex': minor
---

System messages accept options under the `anthropic-vertex` key, including per-message `cacheControl` for cache breakpoints with their own TTL. Models from Claude Opus 4.8, Sonnet 5, and Haiku 5.5 on accept a system message directly after a user or tool message; earlier models accept system messages only at the start of the conversation.
