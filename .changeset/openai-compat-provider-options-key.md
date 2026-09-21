---
'@core-ai/openai-compat': minor
---

**Breaking:** provider options are now read from `providerOptions['openai-compat']`. Options under `providerOptions.openai` are silently ignored for OpenAI-compatible models — move them to the `openai-compat` key. The accepted fields are unchanged and typed via the new `OpenAICompatGenerateProviderOptions` export.
