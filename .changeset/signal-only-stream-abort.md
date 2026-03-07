---
'@core-ai/core-ai': minor
'@core-ai/openai': minor
'@core-ai/anthropic': minor
'@core-ai/google-genai': minor
'@core-ai/mistral': minor
---

Simplify stream cancellation by removing `abort()` from `ChatStream` and `ObjectStream` and relying exclusively on caller-provided `AbortSignal`s across core-ai and all provider adapters.
