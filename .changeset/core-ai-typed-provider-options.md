---
'@core-ai/core-ai': minor
---

Replace `ModelConfig` with flat sampling fields (`temperature`, `maxTokens`, `topP`) on generate options. Introduce method-specific typed provider option interfaces (`GenerateProviderOptions`, `EmbedProviderOptions`, `ImageProviderOptions`) that providers extend via declaration merging, replacing the untyped `Record<string, unknown>`.
