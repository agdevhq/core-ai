---
'@core-ai/anthropic': minor
'@core-ai/openai': minor
'@core-ai/google-genai': minor
'@core-ai/mistral': minor
---

Tool parameters and structured output schemas accept any Standard Schema with JSON Schema support or plain JSON Schema. Zod is no longer a peer dependency; the package uses it internally to validate its own `providerOptions`.
