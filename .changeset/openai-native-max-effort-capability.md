---
'@core-ai/openai': patch
---

Honour `nativeMaxEffort` on capabilities passed to `createOpenAIProvider()` through `modelCapabilities`. Entries can now set `nativeMaxEffort: true` (typed via the new exported `OpenAICompatibleModelCapabilities`) so the core `max` effort is sent as `max` instead of `xhigh` on both the Responses and Chat Completions APIs, for OpenAI-compatible endpoints whose models accept `max`. The flag defaults to `false`. Built-in OpenAI models are unchanged.
