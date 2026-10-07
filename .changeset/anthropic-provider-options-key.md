---
'@core-ai/anthropic': minor
---

**Breaking:** the Anthropic adapter now reads `providerOptions` from the key matching the model's provider id (`model.provider`) instead of always reading `providerOptions.anthropic`. Models from `createAnthropic()` are unaffected; providers built on `createAnthropicChatProvider()` with a custom `providerId` now read options only from their own key and ignore `anthropic`. Structured output (`generateObject`/`streamObject`) also writes its output config under the provider's own key.
