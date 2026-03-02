# @core-ai/mistral

## 0.5.0

### Minor Changes

- b407153: Add reasoning support for Mistral Magistral models. Extracts thinking chunks from response content and streams as reasoning events. No effort mapping needed as Magistral models always reason at full capacity.

### Patch Changes

- Updated dependencies [b407153]
    - @core-ai/core-ai@0.5.0

## 0.4.0

### Minor Changes

- 9664af0: Update Mistral usage mapping to the new nested `ChatUsage` structure.

    Mistral usage now reports cache and reasoning details in nested fields with zero
    defaults:
    - `usage.inputTokenDetails.cacheReadTokens = 0`
    - `usage.inputTokenDetails.cacheWriteTokens = 0`
    - `usage.outputTokenDetails.reasoningTokens = 0`

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

### Minor Changes

- ff7da7c: Add a new `@core-ai/mistral` provider package powered by the latest
  `@mistralai/mistralai` SDK, including chat generation, streaming, tool-calling,
  and embeddings support.

### Patch Changes

- @core-ai/core-ai@0.2.0
