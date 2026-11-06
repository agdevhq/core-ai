---
'@core-ai/core-ai': minor
---

Add `phase` to `ProviderError`. `createChatStream` sets it to `'request'` when the request failed and to `'stream'` when the failure came after the response started, so callers can tell which errors already went through request retries.
