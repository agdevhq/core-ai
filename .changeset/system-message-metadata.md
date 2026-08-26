---
'@core-ai/core-ai': minor
---

Add an optional application-owned `metadata` field to `SystemMessage`, matching the existing contract on message parts: provider adapters ignore it and never serialize it to provider APIs. This lets applications (for example privacy-masking middleware) carry annotations on system prompts without affecting provider wire payloads.
