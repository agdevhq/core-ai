---
'@core-ai/core-ai': minor
'@core-ai/openai': minor
'@core-ai/anthropic': minor
'@core-ai/google-genai': minor
'@core-ai/mistral': minor
---

Add first-class structured output support with `generateObject()` and
`streamObject()` across core and all provider chat models.

This introduces schema-driven typed object generation, structured output
streaming events, and standardized structured-output errors while keeping
provider strategy logic inside provider packages.
