# @core-ai/langfuse

## 0.14.0

### Patch Changes

- Updated dependencies [8e64097]
    - @core-ai/core-ai@0.14.0

## 0.13.1

### Patch Changes

- @core-ai/core-ai@0.13.1

## 0.13.0

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

- fb9162a: Fix double-counting of cache and reasoning tokens in Langfuse usage breakdown. The `input` and `output` keys now report only non-overlapping token counts so Langfuse's aggregation sums correctly.
    - @core-ai/core-ai@0.10.2

## 0.10.1

### Patch Changes

- f67ed1a: Add Langfuse product and docs links to the package README.
- 589219e: Fix usageDetails keys to match Langfuse's expected naming convention (input, output, total, etc.) so that cost inference and UI aggregation work correctly.
    - @core-ai/core-ai@0.10.1

## 0.10.0

### Minor Changes

- 44034f4: Add a first-party Langfuse middleware package for chat, embedding, and image model telemetry.

### Patch Changes

- @core-ai/core-ai@0.10.0
