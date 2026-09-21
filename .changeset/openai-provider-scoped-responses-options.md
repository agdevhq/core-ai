---
'@core-ai/openai': minor
---

Add the `reasoningTokenAccounting` compatibility option, provider-scoped provider options on the Responses API (`responsesProviderOptionsSchema`), and the `promptCacheKey` provider option. Encrypted reasoning is now requested for always-on reasoning models, the Responses API no longer sends a reasoning effort to models without configurable efforts, and the `end_turn` finish reason maps to `stop`.
