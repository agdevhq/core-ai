---
'@core-ai/google-vertex': minor
---

Add the `maxRetries` option to `createGoogleVertex()`. Vertex chat requests that fail transiently before the response starts (rate limit, overload, 5xx, network failure) are now retried up to 2 times by default; `0` disables the retries.
