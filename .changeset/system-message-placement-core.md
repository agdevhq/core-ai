---
'@core-ai/core-ai': minor
---

**Breaking:** `ModelCapabilities` gains a required `messages.systemPlacement` field (`'leading' | 'before-reply' | 'anywhere'`) describing where a model accepts system messages after the first non-system message. Custom `ChatModel` implementations and capability registries must add it. Adds `validateSystemMessagePlacement()`, which provider adapters run before every request and which throws the new `UnsupportedSystemMessagePlacementError`, and `getSystemMessagePlacementIssues()` to check a conversation without sending it. `SystemMessage` gains `providerOptions`, keyed by provider id.
