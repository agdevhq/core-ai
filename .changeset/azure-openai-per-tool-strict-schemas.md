---
'@core-ai/azure-openai': minor
---

Support per-tool `strict: true` without provider-level gates: the `strictToolSchemasEnabled` option and the classic API-version assertion were removed. Strict tools are forwarded with normalized schemas on both the v1 and classic endpoints; classic deployments need `api-version` 2024-08-01-preview or later, and deployments without structured outputs surface Azure's own error.
