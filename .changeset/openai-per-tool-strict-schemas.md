---
'@core-ai/openai': minor
---

Support per-tool `strict: true` on the Responses and Chat Completions APIs. Strict tools are validated against the strict-capable schema contract and sent with a normalized schema (`$schema` stripped, `additionalProperties: false` added); non-strict tools keep the previous wire format. Unknown model ids (including `ft:` fine-tunes) now report strict schemas as supported and forward strict tools optimistically. The `strictToolSchemas`, `strictToolSchemasUnsupportedReason/Details`, and `disableParallelToolCallsWithStrictTools` factory options were removed.
