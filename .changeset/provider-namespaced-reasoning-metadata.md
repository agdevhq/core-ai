---
'@core-ai/core-ai': minor
'@core-ai/anthropic': minor
'@core-ai/google-genai': minor
'@core-ai/mistral': minor
---

Restructure reasoning `providerMetadata` to use provider-namespaced keys (e.g. `{ anthropic: { signature: '...' } }`). Adapters now detect cross-provider reasoning blocks and downgrade them to plain text instead of forwarding opaque metadata. Add `getProviderMetadata` helper to `@core-ai/core-ai`.
