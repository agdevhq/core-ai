---
'@core-ai/core-ai': patch
---

Add `isTransientNetworkError`, which detects a connection that failed or dropped mid-response from the error code in its `cause` chain. Stream errors no longer pass a network `TypeError` from `fetch` through unmapped; it reaches the provider's error mapping.
