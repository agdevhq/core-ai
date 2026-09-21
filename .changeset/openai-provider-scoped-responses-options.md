---
'@core-ai/openai': minor
---

Add the `reasoningTokenAccounting` compatibility option and the `promptCacheKey` provider option. Encrypted reasoning is now requested for always-on reasoning models, and the Responses API no longer sends a reasoning effort to models without configurable efforts.

`createOpenAIProvider` now reads Responses API provider options from `providerOptionsKey ?? providerId` (validated by the new `responsesProviderOptionsSchema`), matching Chat Completions. Previously the Responses API always read `providerOptions.openai`. Wrappers that set a custom `providerId` and want to keep the `openai` namespace must pass `providerOptionsKey: 'openai'`.
