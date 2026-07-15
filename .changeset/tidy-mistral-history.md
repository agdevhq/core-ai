---
'@core-ai/mistral': patch
---

Preserve historical reasoning when sending conversation history to Mistral. Native Mistral reasoning is replayed as a thinking chunk only when the target model supports reasoning input; otherwise (foreign reasoning, or a model that does not support reasoning such as codestral) it is injected into the assistant message as `<thinking>` text. This matches the OpenAI, Anthropic, and Kimi adapters and avoids replaying thinking chunks to models that reject them.
