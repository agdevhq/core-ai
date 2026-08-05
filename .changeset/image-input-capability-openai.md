---
'@core-ai/openai': minor
---

Report image input support per model. `gpt-3.5-turbo`, `o1-mini`, and `o3-mini` are marked text-only; unknown model IDs stay image capable. Both the Responses and Chat Completions adapters reject images for text-only models before calling the API.

The Responses adapter now resolves capabilities and the provider id from the chat model instead of always reading the first-party OpenAI registry. Providers built on `createOpenAIProvider` (such as `@core-ai/azure-openai`) therefore validate against their own capability registry and tag `ValidationError.provider` with their own id.
