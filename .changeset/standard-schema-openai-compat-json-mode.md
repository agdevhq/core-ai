---
'@core-ai/openai-compat': minor
---

With `structuredOutputMode: 'json-object'`, `generateObject()` and `streamObject()` accept schemas with optional keys. The system message shows the schema as is instead of in OpenAI's strict form.
