---
'@core-ai/openai': patch
---

Chat Completions streams emit `tool-call-start` before a tool call's first `tool-call-delta`, like the other adapters. The first delta came first before.
