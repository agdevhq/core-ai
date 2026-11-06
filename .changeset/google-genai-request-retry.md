---
'@core-ai/google-genai': minor
---

Turn on the request retries of the Google SDK, matching the default of the OpenAI and Anthropic SDKs: a request that fails with a rate limit, overload or 5xx before the response starts is retried up to 2 times. The SDK does not retry network failures in Node.js. Applies to all requests of a client that core-ai creates. A supplied `client` keeps its own settings.
