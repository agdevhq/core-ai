# @core-ai/google-genai

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
