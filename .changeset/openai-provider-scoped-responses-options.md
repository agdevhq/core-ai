---
'@core-ai/openai': minor
---

Add the `reasoningTokenAccounting` compatibility option and the `promptCacheKey` provider option. Encrypted reasoning is now requested for always-on reasoning models, and the Responses API no longer sends a reasoning effort to models without configurable efforts.

**Breaking:** `createOpenAIProvider` always reads provider options from `providerOptions[providerId]`, on both the Responses and Chat Completions APIs. The `providerOptionsKey` factory option is removed, and the Responses API no longer falls back to `providerOptions.openai` for other provider ids. Use the new `responsesProviderOptionsSchema` factory option to validate a wrapper's Responses options.
