---
'@core-ai/openai-compat': patch
---

Select the Chat Completions token-limit parameter automatically for known OpenAI models while keeping `max_tokens` as the compatibility default for unknown models. Set `maxTokensParameter` on the provider to configure a different compatibility default.
