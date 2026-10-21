---
'@core-ai/anthropic': minor
---

Discovery results accept `providerOptions.anthropic.cacheControl` (augmenting `ToolDiscoveryResultMessageProviderOptions`, with the new `AnthropicToolDiscoveryResultMessageProviderOptions` type and schema), natively and emulated, so a step that ends with a discovery result can carry an explicit cache breakpoint. It counts toward the 4-breakpoint limit like any other.
