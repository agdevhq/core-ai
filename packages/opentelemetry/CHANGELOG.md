# @core-ai/opentelemetry

## 0.36.2

### Patch Changes

- @core-ai/core-ai@0.36.2

## 0.36.1

### Patch Changes

- @core-ai/core-ai@0.36.1

## 0.36.0

### Minor Changes

- aa18a92: Record discovery calls and discovery results in the input and output message attributes.

### Patch Changes

- aa18a92: `gen_ai.tool.definitions` lists the tools the model is offered: with tool discovery, also the discovery tool and the discovered tools. Each definition carries the tool's own name instead of its key in `tools`. A history that fails discovery validation records only the caller's tools and never fails the call.
- Updated dependencies [aa18a92]
- Updated dependencies [aa18a92]
- Updated dependencies [aa18a92]
- Updated dependencies [aa18a92]
    - @core-ai/core-ai@0.36.0

## 0.35.0

### Minor Changes

- 3dd9026: Middleware types accept any `SchemaInput` for `generateObject` and `streamObject`, following `@core-ai/core-ai`'s Standard Schema support.
- 3dd9026: A tool schema that cannot be converted to JSON Schema ends the chat span with an error instead of leaving it open.

### Patch Changes

- Updated dependencies [8759754]
- Updated dependencies [3dd9026]
    - @core-ai/core-ai@0.35.0

## 0.34.0

### Patch Changes

- @core-ai/core-ai@0.34.0

## 0.33.0

### Patch Changes

- @core-ai/core-ai@0.33.0

## 0.32.0

### Patch Changes

- Updated dependencies [fbf70a5]
    - @core-ai/core-ai@0.32.0

## 0.31.0

### Patch Changes

- Updated dependencies [76d8ba6]
    - @core-ai/core-ai@0.31.0

## 0.30.0

### Patch Changes

- @core-ai/core-ai@0.30.0

## 0.29.1

### Patch Changes

- @core-ai/core-ai@0.29.1

## 0.29.0

### Patch Changes

- Updated dependencies [eb05b64]
    - @core-ai/core-ai@0.29.0

## 0.28.1

### Patch Changes

- @core-ai/core-ai@0.28.1

## 0.28.0

### Patch Changes

- @core-ai/core-ai@0.28.0

## 0.27.1

### Patch Changes

- @core-ai/core-ai@0.27.1

## 0.27.0

### Patch Changes

- @core-ai/core-ai@0.27.0

## 0.26.0

### Patch Changes

- @core-ai/core-ai@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [d98a0cb]
    - @core-ai/core-ai@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies [d65aa5a]
    - @core-ai/core-ai@0.24.0

## 0.23.0

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

### Patch Changes

- Updated dependencies [05515dc]
- Updated dependencies [7281534]
    - @core-ai/core-ai@0.20.0

## 0.19.0

### Minor Changes

- de380ee: Serialize audio user content in recorded chat input attributes.

### Patch Changes

- Updated dependencies [de380ee]
- Updated dependencies [b087061]
    - @core-ai/core-ai@0.19.0

## 0.18.0

### Patch Changes

- @core-ai/core-ai@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [5a720e8]
- Updated dependencies [f6a6f5b]
    - @core-ai/core-ai@0.17.0

## 0.16.0

### Patch Changes

- @core-ai/core-ai@0.16.0

## 0.15.0

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

### Minor Changes

- 657ca1f: Add model-level middleware wrappers (`wrapChatModel`, `wrapEmbeddingModel`, `wrapImageModel`) to core-ai and provide first-party OpenTelemetry middleware in `@core-ai/opentelemetry` via `createOtelMiddleware`, `createOtelEmbeddingMiddleware`, and `createOtelImageMiddleware`.

### Patch Changes

- Updated dependencies [657ca1f]
    - @core-ai/core-ai@0.9.0
