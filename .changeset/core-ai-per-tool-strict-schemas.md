---
'@core-ai/core-ai': minor
---

Add per-tool strict tool schemas: `defineTool` accepts `strict: true` to opt a single tool into provider-enforced schema adherence, `ModelCapabilities.tools.strictSchemas` reports model support, and `validateToolSchemaStrictness` validates strict tools against the strict-capable schema contract (closed objects, every key required — use `.nullable()` instead of `.optional()` — and a shared keyword subset). Violations throw `ToolSchemaStrictnessError` with reason `'unsupported'`, `'limit-exceeded'`, or `'invalid-schema'` and a `violations` list naming each offending schema path. Also exports `normalizeStrictJsonSchema` and `getStrictToolSchemaViolations`.
