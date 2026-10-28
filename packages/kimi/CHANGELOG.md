# @core-ai/kimi

## 0.36.1

### Patch Changes

- Updated dependencies [6ccfc5a]
    - @core-ai/openai@0.36.1
    - @core-ai/core-ai@0.36.1

## 0.36.0

### Minor Changes

- aa18a92: Support tool discovery by emulation: the discovery tool and discovered tools are declared as ordinary function tools.

### Patch Changes

- Updated dependencies [aa18a92]
- Updated dependencies [aa18a92]
- Updated dependencies [aa18a92]
- Updated dependencies [aa18a92]
- Updated dependencies [aa18a92]
- Updated dependencies [aa18a92]
- Updated dependencies [aa18a92]
- Updated dependencies [aa18a92]
    - @core-ai/openai@0.36.0
    - @core-ai/core-ai@0.36.0

## 0.35.0

### Minor Changes

- 3dd9026: `generateObject()` and `streamObject()` accept schemas with optional keys. JSON Mode shows the schema to the model as is instead of in OpenAI's strict form.
- 3dd9026: Zod is no longer a peer dependency. Tool parameters and structured output schemas accept any Standard Schema with JSON Schema support or plain JSON Schema.

### Patch Changes

- Updated dependencies [8759754]
- Updated dependencies [8759754]
- Updated dependencies [3dd9026]
- Updated dependencies [3dd9026]
- Updated dependencies [3dd9026]
    - @core-ai/core-ai@0.35.0
    - @core-ai/openai@0.35.0

## 0.34.0

### Patch Changes

- @core-ai/core-ai@0.34.0
- @core-ai/openai@0.34.0

## 0.33.0

### Patch Changes

- @core-ai/core-ai@0.33.0
- @core-ai/openai@0.33.0

## 0.32.0

### Patch Changes

- Updated dependencies [fbf70a5]
    - @core-ai/core-ai@0.32.0
    - @core-ai/openai@0.32.0

## 0.31.0

### Minor Changes

- 76d8ba6: Models report `systemPlacement: 'anywhere'`, and requests run the system message placement check. System messages are still sent where they appear.

### Patch Changes

- Updated dependencies [76d8ba6]
- Updated dependencies [76d8ba6]
    - @core-ai/core-ai@0.31.0
    - @core-ai/openai@0.31.0

## 0.30.0

### Patch Changes

- @core-ai/core-ai@0.30.0
- @core-ai/openai@0.30.0

## 0.29.1

### Patch Changes

- @core-ai/core-ai@0.29.1
- @core-ai/openai@0.29.1

## 0.29.0

### Patch Changes

- Updated dependencies [eb05b64]
    - @core-ai/core-ai@0.29.0
    - @core-ai/openai@0.29.0

## 0.28.1

### Patch Changes

- Updated dependencies [045394f]
    - @core-ai/openai@0.28.1
    - @core-ai/core-ai@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [95bb203]
    - @core-ai/openai@0.28.0
    - @core-ai/core-ai@0.28.0

## 0.27.1

### Patch Changes

- Updated dependencies [45957a2]
    - @core-ai/openai@0.27.1
    - @core-ai/core-ai@0.27.1

## 0.27.0

### Patch Changes

- @core-ai/core-ai@0.27.0
- @core-ai/openai@0.27.0

## 0.26.0

### Patch Changes

- Updated dependencies [8d0c48a]
    - @core-ai/openai@0.26.0
    - @core-ai/core-ai@0.26.0

## 0.25.0

### Minor Changes

- d98a0cb: Forward per-tool `strict: true` with normalized schemas; tools that do not opt in are no longer sent with an explicit `strict: false`.

### Patch Changes

- Updated dependencies [d98a0cb]
- Updated dependencies [d98a0cb]
    - @core-ai/core-ai@0.25.0
    - @core-ai/openai@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies [7792a13]
- Updated dependencies [7792a13]
- Updated dependencies [d65aa5a]
    - @core-ai/openai@0.24.0
    - @core-ai/core-ai@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [a4d08b7]
- Updated dependencies [a4d08b7]
- Updated dependencies [a4d08b7]
    - @core-ai/openai@0.23.0
    - @core-ai/core-ai@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies [717364e]
    - @core-ai/core-ai@0.22.0
    - @core-ai/openai@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [37c890d]
    - @core-ai/core-ai@0.21.0
    - @core-ai/openai@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [05515dc]
- Updated dependencies [05515dc]
- Updated dependencies [7281534]
    - @core-ai/core-ai@0.20.0
    - @core-ai/openai@0.20.0

## 0.19.0

### Minor Changes

- de380ee: Reject audio user content because Kimi chat models remain text-only.
- b087061: Report chat modalities in model capabilities. The K2.7 Code models are text-only (`modalities.input: ['text']`), so image parts are rejected before the request is sent; unknown model IDs stay multimodal capable (`['text', 'image', 'file']`). `modalities.output` is `['text']`.

### Patch Changes

- Updated dependencies [de380ee]
- Updated dependencies [de380ee]
- Updated dependencies [b087061]
- Updated dependencies [b087061]
    - @core-ai/core-ai@0.19.0
    - @core-ai/openai@0.19.0

## 0.18.0

### Patch Changes

- @core-ai/core-ai@0.18.0
- @core-ai/openai@0.18.0

## 0.17.0

### Minor Changes

- 19319f9: Add `@core-ai/kimi` provider for Moonshot AI Kimi API with native `reasoning_content` support, preserved thinking round-trips, Kimi K2.7 Code fixed sampling validation, and JSON Mode structured output via `generateObject` / `streamObject`.
- 5a720e8: Build the Kimi provider on the shared OpenAI-compatible implementation while preserving K2.7 reasoning, validation, tools, streaming, and structured JSON object output. Unknown model IDs now use unrestricted fallback capabilities instead of inheriting K2.7-specific restrictions. Remove the raw JSON Mode option from `generate()` and `stream()`; use `generateObject()` and `streamObject()` for structured output.

### Patch Changes

- Updated dependencies [5a720e8]
- Updated dependencies [15b9ba6]
- Updated dependencies [5a720e8]
- Updated dependencies [f6a6f5b]
- Updated dependencies [f6a6f5b]
    - @core-ai/core-ai@0.17.0
    - @core-ai/openai@0.17.0
