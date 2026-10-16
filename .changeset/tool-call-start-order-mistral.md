---
'@core-ai/mistral': patch
---

Streams emit `tool-call-start` before a tool call's first `tool-call-delta`, like the other adapters. The first delta came first before.
