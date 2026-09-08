---
'@core-ai/openai': minor
---

Raise Responses API failures (`error` / `response.failed` stream events, and generate `status: 'failed'`) as provider errors instead of a successful result with `finishReason: 'unknown'`, so in-band failures such as `server_error` or `rate_limit_exceeded` reach the typed error classes. `response.incomplete` now ends the stream with the reported finish reason (`length` / `content-filter`) and usage.
