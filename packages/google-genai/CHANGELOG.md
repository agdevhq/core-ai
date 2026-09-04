# @core-ai/google-genai

## 0.23.0

### Minor Changes

- a4d08b7: Wrap in-band stream errors as typed provider errors and expose Google's gRPC status (e.g. `RESOURCE_EXHAUSTED`) as `ProviderError.code`.

### Patch Changes

- Updated dependencies [a4d08b7]
    - @core-ai/core-ai@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies [717364e]
    - @core-ai/core-ai@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [37c890d]
    - @core-ai/core-ai@0.21.0

## 0.20.0

### Minor Changes

- 7281534: Round-trip thought signatures on function calls. Signatures are read from the candidate parts on generate and stream, exposed under `providerMetadata.google` of the tool call part, and sent back on the matching `functionCall` part. Without this, Gemini 3 rejects multi-step tool calling with a 400 for a missing `thought_signature`. Stream and generate adapters also read assistant text from candidate parts instead of the SDK `.text` getter, which otherwise warns whenever a chunk mixes text with function calls.

### Patch Changes

- Updated dependencies [05515dc]
- Updated dependencies [7281534]
    - @core-ai/core-ai@0.20.0

## 0.19.0

### Minor Changes

- de380ee: Accept base64 audio input on Gemini chat models and map it to Generate Content inline data.
- b087061: Report chat modalities in model capabilities. Every Gemini chat model reports `modalities.input: ['text', 'image', 'file']` and `modalities.output: ['text']`, and the adapter validates image parts against the capability before calling the API. Audio and video are not advertised until dedicated user content parts exist.

### Patch Changes

- Updated dependencies [de380ee]
- Updated dependencies [b087061]
    - @core-ai/core-ai@0.19.0

## 0.18.0

### Patch Changes

- @core-ai/core-ai@0.18.0

## 0.17.0

### Minor Changes

- f6a6f5b: Map Google GenAI / Vertex SDK failures to structured `ProviderError` subclasses in `wrapGoogleError`, including streaming error-body prefixes and Vertex throttled overload wording.

### Patch Changes

- 5a720e8: Report always-on reasoning for Gemini models whose thinking cannot be disabled.
- Updated dependencies [5a720e8]
- Updated dependencies [f6a6f5b]
    - @core-ai/core-ai@0.17.0

## 0.16.0

### Patch Changes

- @core-ai/core-ai@0.16.0

## 0.15.0

### Minor Changes

- f579bcb: Support Gemini native image models through `imageModel()` while preserving the existing Imagen generation path.
- f579bcb: Expose a reusable provider factory with configurable provider attribution for Google GenAI clients.

### Patch Changes

- Updated dependencies [381fd9d]
    - @core-ai/core-ai@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [8e64097]
    - @core-ai/core-ai@0.14.0

## 0.13.1

### Patch Changes

- @core-ai/core-ai@0.13.1

## 0.13.0

### Minor Changes

- de090e2: Expose a shared ModelCapabilities contract on ChatModel and via provider get\*ModelCapabilities helpers so consumers can inspect reasoning support without duplicating provider maps.

### Patch Changes

- Updated dependencies [de090e2]
    - @core-ai/core-ai@0.13.0

## 0.12.0

### Patch Changes

- @core-ai/core-ai@0.12.0

## 0.11.1

### Patch Changes

- 43d926e: Add `require` and `default` export conditions so packages resolve under CommonJS loaders such as tsx.
- Updated dependencies [43d926e]
    - @core-ai/core-ai@0.11.1

## 0.11.0

### Patch Changes

- Updated dependencies [b077b82]
    - @core-ai/core-ai@0.11.0

## 0.10.3

### Patch Changes

- @core-ai/core-ai@0.10.3

## 0.10.2

### Patch Changes

- @core-ai/core-ai@0.10.2

## 0.10.1

### Patch Changes

- @core-ai/core-ai@0.10.1

## 0.10.0

### Patch Changes

- @core-ai/core-ai@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [657ca1f]
    - @core-ai/core-ai@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [abb5d6f]
    - @core-ai/core-ai@0.8.0

## 0.7.1

### Patch Changes

- d94fd45: Refactor shared model-id, provider utility, and capability mapping helpers across providers without changing public behavior.
- Updated dependencies [3f8addd]
- Updated dependencies [d94fd45]
    - @core-ai/core-ai@0.7.1

## 0.7.0

### Minor Changes

- 7ed8b49: **Breaking:** Require Zod 4 (`^4.0.0`) and replace `zod-to-json-schema` with Zod 4's native `z.toJSONSchema()`. The `zod-to-json-schema` library produced empty JSON schemas for Zod 4 schemas, breaking tool parameter conversion. A new `zodSchemaToJsonSchema` utility is exported from `@core-ai/core-ai` for consumers that need direct Zod-to-JSON-Schema conversion.

### Patch Changes

- Updated dependencies [7ed8b49]
    - @core-ai/core-ai@0.7.0

## 0.6.1

### Patch Changes

- ccca3e9: Add model capability support for gemini-3.1-pro and gemini-3.1-flash-lite-preview.
- c06e653: Refactor adapter internals to reduce duplication and simplify stream/request helper logic without changing runtime behavior.
- Updated dependencies [3b599ab]
    - @core-ai/core-ai@0.6.1

## 0.6.0

### Minor Changes

- 308a307: Namespace provider options under the `google` key with strict Zod validation. Only explicitly supported, typed provider options are accepted now. Generate options: `stopSequences`, `frequencyPenalty`, `presencePenalty`, `seed`, `topK`. Embed options: `taskType`, `title`, `mimeType`, `autoTruncate`. Image options: `aspectRatio`, `personGeneration`, `safetyFilterLevel`, `negativePrompt`, `guidanceScale`, `seed`, and other documented top-level fields.
- dbe063d: Restructure reasoning `providerMetadata` to use provider-namespaced keys (e.g. `{ anthropic: { signature: '...' } }`). Adapters now detect cross-provider reasoning blocks and downgrade them to plain text instead of forwarding opaque metadata. Add `getProviderMetadata` helper to `@core-ai/core-ai`.
- c6882e4: Update provider streaming adapters to expose replayable stream handles using the new `ChatStream` and `ObjectStream` types.

### Patch Changes

- be5f32a: Refactor adapter internals to remove duplicated request assembly and reasoning stream cleanup logic without changing behavior.
- Updated dependencies [308a307]
- Updated dependencies [dbe063d]
- Updated dependencies [c6882e4]
    - @core-ai/core-ai@0.6.0

## 0.5.1

### Patch Changes

- 6627888: Fix release publish race: remove prepublishOnly to avoid concurrent tsup builds failing to resolve @core-ai/core-ai.
- Updated dependencies [6627888]
    - @core-ai/core-ai@0.5.1

## 0.5.0

### Minor Changes

- b407153: Add reasoning support for Google GenAI models. Maps unified `reasoning.effort` to `thinkingLevel` for Gemini 3 or `thinkingBudget` for Gemini 2.5 based on model capabilities. Extracts thought content with thought signature preservation for multi-turn fidelity. Automatically enables `includeThoughts` when reasoning is configured.

### Patch Changes

- Updated dependencies [b407153]
    - @core-ai/core-ai@0.5.0

## 0.4.0

### Minor Changes

- 9664af0: Update Google GenAI usage mapping to the new nested `ChatUsage` structure.

    Google GenAI responses now map:
    - `usage.inputTokenDetails.cacheReadTokens` from `usageMetadata.cachedContentTokenCount`
    - `usage.outputTokenDetails.reasoningTokens` from `usageMetadata.thoughtsTokenCount`

    `usage.totalTokens` and top-level `usage.reasoningTokens` are no longer returned.

### Patch Changes

- Updated dependencies [9664af0]
    - @core-ai/core-ai@0.4.0

## 0.3.0

### Minor Changes

- 8b1540e: Add first-class structured output support with `generateObject()` and
  `streamObject()` across core and all provider chat models.

    This introduces schema-driven typed object generation, structured output
    streaming events, and standardized structured-output errors while keeping
    provider strategy logic inside provider packages.

- 5f3df42: Clarify embedding usage semantics by making `EmbedResult.usage` optional in the
  core API contract, so providers can return `usage: undefined` when token counts
  are not exposed by the underlying API.

    Update Google GenAI embedding behavior to only include usage when token
    statistics are present, and add provider E2E contract coverage for cross-
    provider live validation.

### Patch Changes

- Updated dependencies [8b1540e]
- Updated dependencies [5f3df42]
    - @core-ai/core-ai@0.3.0

## 0.2.1

### Patch Changes

- 37e0cc6: Broaden Zod compatibility to support both Zod 3 and Zod 4 across all packages.

    This updates published Zod ranges and raises the minimum `zod-to-json-schema`
    version to one that supports Zod 4, preventing peer dependency conflicts for
    projects already using Zod 4.

- Updated dependencies [37e0cc6]
    - @core-ai/core-ai@0.2.1

## 0.2.0

### Patch Changes

- @core-ai/core-ai@0.2.0
