---
'@core-ai/openai': minor
---

Support per-tool `strict: true` on the Responses and Chat Completions APIs. Strict tools are validated against the strict-capable schema contract and sent with a normalized schema (`$schema` stripped, `additionalProperties: false` added, `oneOf` rewritten to `anyOf`); non-strict tools keep the raw schema and are sent to the Responses API with an explicit `strict: false` so the API does not auto-strict them. Models that predate Structured Outputs (`gpt-4o-2024-05-13`, GPT-4 Turbo, GPT-3.5 Turbo) report strict schemas as unsupported through both APIs; fine-tuned `ft:<base>:...` models inherit their base model's capabilities; other unknown model ids report strict schemas as supported and forward strict tools optimistically. The `strictToolSchemas`, `strictToolSchemasUnsupportedReason/Details`, and `disableParallelToolCallsWithStrictTools` factory options were removed.
