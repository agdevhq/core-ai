---
'@core-ai/anthropic': minor
'@core-ai/vertex-anthropic': minor
---

Add `@core-ai/vertex-anthropic`, a provider for Claude models hosted on Google Vertex AI. Vertex AI publishes Claude models to EU regions (e.g. `europe-west1`, `eu`), keeping inference within the EU for GDPR-sensitive deployments — unlike Anthropic's own direct API, which is US-hosted only. It shares its request, streaming, tool-calling, structured-output, and reasoning behavior with `@core-ai/anthropic` through a new `@core-ai/anthropic/compat` entry point that exposes a provider-id-aware chat provider factory. Authenticates via Application Default Credentials by default, or an explicit service account JSON key.
