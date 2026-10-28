---
'@core-ai/openai': minor
---

Report OpenAI's per-request image limit (1,500) in `capabilities.input` for image-capable models on the Responses and Chat Completions APIs when the client targets `api.openai.com` or a regional OpenAI host. With a `baseURL` or client pointing at any other server, `input` is absent. Unknown model ids report no limit. Add `omitOpenAIInputLimits()` for providers that reuse OpenAI model capabilities on another host.
