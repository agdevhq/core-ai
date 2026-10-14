---
'@core-ai/mistral': patch
'@core-ai/openai': patch
---

Streams emit `tool-call-start` before a tool call's first `tool-call-delta`, like the other adapters. The Mistral and Chat Completions adapters emitted the first delta first.
