---
'@core-ai/kimi': minor
---

Build the Kimi provider on the shared OpenAI-compatible implementation while preserving K2.7 reasoning, validation, tools, streaming, and structured JSON object output. Unknown model IDs now use unrestricted fallback capabilities instead of inheriting K2.7-specific restrictions. Remove the raw JSON Mode option from `generate()` and `stream()`; use `generateObject()` and `streamObject()` for structured output.
