---
'@core-ai/core-ai': minor
---

**Breaking:** tool `parameters` and `generateObject` / `streamObject` schemas accept any [Standard Schema](https://standardschema.dev) that implements Standard JSON Schema (Zod 4.2+, ArkType, Valibot via `toStandardJsonSchema()`, and others) or plain JSON Schema, which is sent byte for byte. Zod is no longer a dependency of `@core-ai/core-ai`, and its public types no longer reference Zod. Zod 4.0–4.1 and `zod/mini` schemas lack Standard JSON Schema and now throw a `ValidationError`: upgrade Zod, or pass `z.toJSONSchema(schema)` as plain JSON Schema and validate yourself.

core-ai validates model output when the schema can validate itself. Tool calls to tools with Standard Schema parameters carry the new `ToolCall.validation` (`{ value }` or `{ issues }`, never thrown, even when the validator itself throws); `resultToMessage()` omits it. A structured output validator that throws becomes a `StructuredOutputValidationError` with the error as its `cause`. `generateObject` returns the validated, typed object for Standard Schemas and the parsed JSON as `unknown` for plain JSON Schema.

Adds `toJsonSchema()`, which returns the JSON Schema core-ai derives from a schema, and replaces `zodSchemaToJsonSchema()`. Adds the `SchemaInput`, `StandardSchemaWithJson`, `JsonSchema`, and `InferSchemaOutput` types, re-exports the Standard Schema type namespaces, and adds adapter helpers (`normalizeSchema`, `getToolJsonSchema`, `normalizeStructuredOutputSchema`, `parseStructuredOutput`, `validateStructuredOutput`, `finalizeGenerateResult`, and the `request` option of `createChatStream`).
