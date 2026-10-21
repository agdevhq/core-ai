---
'@core-ai/core-ai': minor
---

Add `ModelCapabilities.tools.strictSchemas.maxUnionParameters`, a per-request limit on union-typed parameters (properties whose schema is an `anyOf`, a `oneOf`, or a `type` array with more than one entry, nullable keys included) across a request's strict tools. Strict tools beyond it throw `ToolSchemaStrictnessError` with the new reason `'union-limit-exceeded'` and its `maxUnionParameters` and `unionParameterCount` fields before the provider request.

**Type change:** `ToolSchemaStrictnessErrorReason` gains `'union-limit-exceeded'`, so exhaustive switches over it must handle it.
