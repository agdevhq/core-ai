# @core-ai/anthropic

## 0.20.0

### Patch Changes

- Updated dependencies [05515dc]
- Updated dependencies [7281534]
    - @core-ai/core-ai@0.20.0

## 0.19.0

### Minor Changes

- de380ee: Reject unsupported audio user content before calling the Anthropic Messages API.
- b087061: Report chat modalities in model capabilities. Every Claude model reports `modalities.input: ['text', 'image', 'file']` and `modalities.output: ['text']`, and the adapter validates image parts against the capability before calling the API. File parts remain PDF-only at the adapter layer.

### Patch Changes

- Updated dependencies [de380ee]
- Updated dependencies [b087061]
    - @core-ai/core-ai@0.19.0

## 0.18.0

### Minor Changes

- 3197a6b: Add model capability support for `claude-opus-5`.

### Patch Changes

- @core-ai/core-ai@0.18.0

## 0.17.0

### Minor Changes

- f6a6f5b: Map Anthropic SDK failures to structured `ProviderError` subclasses in `wrapAnthropicError`, including Vertex single-level envelopes and correct rate-limit vs context discrimination.

### Patch Changes

- Updated dependencies [5a720e8]
- Updated dependencies [f6a6f5b]
    - @core-ai/core-ai@0.17.0

## 0.16.0

### Patch Changes

- @core-ai/core-ai@0.16.0

## 0.15.0

### Minor Changes

- f87ff4f: Add `@core-ai/anthropic-vertex` for Claude models on Google Vertex AI. Shares chat behavior with `@core-ai/anthropic` via `createAnthropicChatProvider`. Authenticates with Application Default Credentials or an explicit service account key.

### Patch Changes

- Updated dependencies [381fd9d]
    - @core-ai/core-ai@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [8e64097]
    - @core-ai/core-ai@0.14.0

## 0.13.1

### Patch Changes

- 8396024: Fix Anthropic adaptive and manual reasoning requests, including tool-use beta headers, token budgets, thinking block preservation, summarized output, and reasoning token usage.
    - @core-ai/core-ai@0.13.1

## 0.13.0

### Minor Changes

- 7bf38dd: Add Claude Sonnet 5 model capability handling.
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

### Minor Changes

- b077b82: Add explicit capability handling and docs for Claude Fable 5, Claude Mythos 5, Claude Opus 4.8, Claude Opus 4.7, and related adaptive-thinking effort support.

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

### Minor Changes

- abb5d6f: Standardize library error handling with `CoreAIError`, `ValidationError`, and provider-aware abort errors.

### Patch Changes

- Updated dependencies [abb5d6f]
    - @core-ai/core-ai@0.8.0

## 0.7.1

### Patch Changes

- b206e97: Add Anthropic prompt caching support through the `cacheControl` provider option.
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

- Updated dependencies [3b599ab]
    - @core-ai/core-ai@0.6.1

## 0.6.0

### Minor Changes

- 308a307: Namespace provider options under `anthropic` key with Zod validation. Generate options: `topK`, `stopSequences`, `betas`, `outputConfig`.
- dbe063d: Restructure reasoning `providerMetadata` to use provider-namespaced keys (e.g. `{ anthropic: { signature: '...' } }`). Adapters now detect cross-provider reasoning blocks and downgrade them to plain text instead of forwarding opaque metadata. Add `getProviderMetadata` helper to `@core-ai/core-ai`.
- c6882e4: Update provider streaming adapters to expose replayable stream handles using the new `ChatStream` and `ObjectStream` types.

### Patch Changes

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

- b407153: Add reasoning support for Anthropic models with adaptive and manual thinking modes. Maps unified `reasoning.effort` to adaptive effort levels or manual `budget_tokens` based on model capabilities. Extracts thinking and redacted thinking blocks with signature preservation for multi-turn fidelity. Validates parameter restrictions (temperature, top_k, topP, forced toolChoice) and sends interleaved-thinking beta header when reasoning is combined with tools.

### Patch Changes

- Updated dependencies [b407153]
    - @core-ai/core-ai@0.5.0

## 0.4.0

### Minor Changes

- 9664af0: Update Anthropic usage mapping to the new nested `ChatUsage` structure and
  normalize cache accounting semantics.

    Anthropic now reports:
    - total `usage.inputTokens` as `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`
    - `usage.inputTokenDetails.cacheReadTokens` from `cache_read_input_tokens`
    - `usage.inputTokenDetails.cacheWriteTokens` from `cache_creation_input_tokens`
    - `usage.outputTokenDetails.reasoningTokens` as `0`

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
