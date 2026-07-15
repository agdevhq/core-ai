---
'@core-ai/mistral': patch
---

Preserve historical reasoning when sending conversation history to Mistral. Native Mistral reasoning is replayed as a thinking chunk, while reasoning from other providers is injected into the assistant message as `<thinking>` text, matching the behavior of the OpenAI, Anthropic, and Kimi adapters.
