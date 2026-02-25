# @core-ai/mistral

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
