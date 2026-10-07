---
'@core-ai/google-vertex': minor
---

**Breaking:** provider options for chat, embedding, and image models are now read from `providerOptions['google-vertex']` instead of `providerOptions.google`, matching the provider id. Options under the `google` key are now ignored — move them to `'google-vertex'` (same fields). The `'google-vertex'` key is typed on `GenerateProviderOptions`, `EmbedProviderOptions`, and `ImageProviderOptions`, and `GoogleVertexGenerateProviderOptions`, `GoogleVertexEmbedProviderOptions`, and `GoogleVertexImageProviderOptions` are exported.
