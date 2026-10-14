---
'@core-ai/core-ai': minor
---

**Breaking:** tool `parameters` and `generateObject` / `streamObject` schemas accept any [Standard Schema](https://standardschema.dev) that implements Standard JSON Schema (Zod 4.2+, ArkType, Valibot via `toStandardJsonSchema()`, and others) or plain JSON Schema of any object type, including `JSONSchema7`, which is sent byte for byte. Zod is no longer a dependency of `@core-ai/core-ai`, and its public types no longer reference Zod. Zod 4.0–4.1 and `zod/mini` schemas lack Standard JSON Schema and now throw a `ValidationError`: upgrade Zod, or pass `z.toJSONSchema(schema)` as plain JSON Schema and validate yourself.

`generateObject` returns the validated, typed object for Standard Schemas and the parsed JSON as `unknown` for plain JSON Schema. A structured output validator that throws becomes a `StructuredOutputValidationError` with the error as its `cause`. Adds `validateToolCall(tool, toolCall)`, which validates a tool call's arguments with the tool's Standard Schema and returns the typed result (`{ value }` or `{ issues }`, never thrown, even when the validator itself throws), or `undefined` for plain JSON Schema parameters.

The strict tool contract accepts optional keys that accept `null` or declare a `default`; strict-capable providers receive them as required. Other optional keys are still rejected.

Adds `toJsonSchema()`, which returns the JSON Schema core-ai derives from a schema, and replaces `zodSchemaToJsonSchema()`. Adds the `SchemaInput`, `StandardSchemaWithJson`, `JsonSchema`, `InferSchemaOutput`, and `ToolCallValidation` types, re-exports the Standard Schema type namespaces, and adds adapter helpers (`getToolJsonSchema`, `normalizeStructuredOutputSchema`, `parseStructuredOutput`, `extractStructuredObject`, `transformStructuredOutputStream`, `requireEveryKey`, and `mapChildSchemaNodes`).
