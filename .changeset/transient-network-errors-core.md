---
'@core-ai/core-ai': minor
---

Add `getTransientNetworkErrorCode`, which returns the network error code of a connection that failed or dropped mid-response from the error's `cause` chain. `ProviderError.code` can now hold such a network code. Stream errors no longer pass a network `TypeError` from `fetch` through unmapped; it reaches the provider's error mapping.
