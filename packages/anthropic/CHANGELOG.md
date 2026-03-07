# @core-ai/anthropic

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
