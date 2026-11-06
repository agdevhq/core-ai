---
'@core-ai/mistral': minor
---

Turn on the request retries of the Mistral SDK: a request that fails transiently before the response starts is retried with exponential backoff. No retry is scheduled once 30 seconds have passed since the first attempt, so the last one can start a few seconds later. Applies to all requests of a client that core-ai creates. A supplied `client` keeps its own settings.
