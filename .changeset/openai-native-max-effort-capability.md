---
'@core-ai/openai': patch
---

Honour `nativeMaxEffort` on capabilities passed to `createOpenAIProvider()` through `modelCapabilities`. Entries can set `nativeMaxEffort: true` (typed via the new exported `OpenAICompatibleModelCapabilities`) so the core `max` effort is sent as `max` instead of `xhigh` on both the Responses and Chat Completions APIs, for OpenAI-compatible endpoints whose models accept `max`. An explicit `false` sends `xhigh`. When the flag is omitted, known OpenAI model IDs keep their built-in mapping and other IDs send `xhigh`, so existing behaviour is unchanged.
