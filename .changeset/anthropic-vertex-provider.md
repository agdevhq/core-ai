---
'@core-ai/anthropic': minor
'@core-ai/anthropic-vertex': minor
---

Add `@core-ai/anthropic-vertex`, a provider for Claude models hosted on Google Vertex AI. Vertex AI publishes Claude models to EU regions (e.g. `europe-west1`, `eu`), keeping inference within the EU for GDPR-sensitive deployments — unlike Anthropic's own direct API, which is US-hosted only. It shares its request, streaming, tool-calling, structured-output, and reasoning behavior with `@core-ai/anthropic` through a provider-id-aware chat provider factory (`createAnthropicChatProvider`). Authenticates via Application Default Credentials by default, or an explicit service account JSON key.
