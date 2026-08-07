---
'@core-ai/openai': minor
---

Report chat modalities per model. GPT-4 / GPT-5 families, `o1`, `o3`, `o3-pro`, and `o4-mini` advertise `modalities.input: ['text', 'image', 'file']`; `gpt-3.5-turbo`, `o1-mini`, and `o3-mini` are text-only. Unknown model IDs stay multimodal capable. Both the Responses and Chat Completions adapters reject images for text-only models before calling the API. `modalities.output` is `['text']` for all chat models.

The Responses adapter now resolves capabilities and the provider id from the chat model instead of always reading the first-party OpenAI registry. Providers built on `createOpenAIProvider` (such as `@core-ai/azure-openai`) therefore validate against their own capability registry and tag `ValidationError.provider` with their own id.
