---
'@core-ai/openai': patch
---

Send `max_completion_tokens` instead of the deprecated `max_tokens` for known OpenAI reasoning models (gpt-5\*, o-series) in the compat adapter — these models reject `max_tokens` with a 400. Unknown model ids keep `max_tokens`, which remains the universally supported parameter on OpenAI-compatible endpoints. The new `providerOptions.openai.maxTokensParam` option overrides the choice explicitly for endpoints where the model id does not reveal the right field.
