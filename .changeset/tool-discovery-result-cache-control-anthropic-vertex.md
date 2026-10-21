---
'@core-ai/anthropic-vertex': minor
---

Discovery results accept `cacheControl` under the `anthropic-vertex` key (the new `AnthropicVertexToolDiscoveryResultMessageProviderOptions` type), natively and emulated, so a step that ends with a discovery result can carry an explicit cache breakpoint.
