---
'@core-ai/anthropic-vertex': minor
---

**Breaking:** provider options for Vertex-hosted Claude models are now read from `providerOptions['anthropic-vertex']` instead of `providerOptions.anthropic`, matching the provider id. Options under the `anthropic` key are now ignored — move them to `'anthropic-vertex'` (same fields). The `'anthropic-vertex'` key is typed on `GenerateProviderOptions`, and `AnthropicVertexGenerateProviderOptions` is exported.
