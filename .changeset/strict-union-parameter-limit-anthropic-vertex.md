---
'@core-ai/anthropic-vertex': minor
---

Strict-capable Claude models report `maxUnionParameters: 16`, so strict tools with more than 16 union-typed parameters in total, nullable keys included, throw `ToolSchemaStrictnessError` locally instead of failing with a provider error.
