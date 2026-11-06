---
'@core-ai/mistral': minor
---

Turn on the request retries of the Mistral SDK: a request that fails transiently before the response starts is retried with exponential backoff, and no new retry starts after 5 seconds. Applies to all requests of a client that core-ai creates. A supplied `client` keeps its own settings.
