---
'@core-ai/openai': minor
---

Raise Responses API `error` and `response.failed` stream events as provider errors instead of silently finishing with `finishReason: 'unknown'`, so in-band failures such as `server_error` or `rate_limit_exceeded` reach the typed error classes. `response.incomplete` now ends the stream with the reported finish reason (`length` / `content-filter`) and usage.
