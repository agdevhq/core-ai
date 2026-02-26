# @core-ai/core-ai

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

## 0.2.1

### Patch Changes

- 37e0cc6: Broaden Zod compatibility to support both Zod 3 and Zod 4 across all packages.

    This updates published Zod ranges and raises the minimum `zod-to-json-schema`
    version to one that supports Zod 4, preventing peer dependency conflicts for
    projects already using Zod 4.

## 0.2.0
