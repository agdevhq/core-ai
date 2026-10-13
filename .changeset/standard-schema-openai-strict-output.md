---
'@core-ai/openai': minor
---

`generateObject()` and `streamObject()` build the strict JSON Schema response format in core-ai instead of through `openai/helpers/zod`, so the schema sent no longer depends on the installed `openai` version. It is derived from the schema's input type as JSON Schema draft 2020-12, where it was draft-07 from Zod's output type: it omits `$schema` and Zod's implicit safe-integer bounds, uses `$defs`, and gives piped fields their input type. Expect one prompt cache miss per schema after upgrading. A key whose `type` array includes `'null'` now counts as nullable, and optional keys strict mode cannot express throw a `ValidationError` that lists the path of each one. In the `json-object` structured output mode, the system message shows the schema as is, so schemas with optional keys work.
