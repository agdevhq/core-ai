# @core-ai/google-vertex

## 0.31.0

### Minor Changes

- 76d8ba6: **Breaking:** models report `systemPlacement: 'leading'`, and a system message after the first non-system message now throws `UnsupportedSystemMessagePlacementError` instead of being merged into `systemInstruction`.

### Patch Changes

- Updated dependencies [76d8ba6]
- Updated dependencies [76d8ba6]
    - @core-ai/core-ai@0.31.0
    - @core-ai/google-genai@0.31.0

## 0.30.0

### Minor Changes

- 788e618: **Breaking:** provider options for chat, embedding, and image models are now read from `providerOptions['google-vertex']` instead of `providerOptions.google`, matching the provider id. Options under the `google` key are now ignored — move them to `'google-vertex'` (same fields). The `'google-vertex'` key is typed on `GenerateProviderOptions`, `EmbedProviderOptions`, and `ImageProviderOptions`, and `GoogleVertexGenerateProviderOptions`, `GoogleVertexEmbedProviderOptions`, and `GoogleVertexImageProviderOptions` are exported.

### Patch Changes

- Updated dependencies [c234edc]
- Updated dependencies [788e618]
    - @core-ai/google-genai@0.30.0
    - @core-ai/core-ai@0.30.0

## 0.29.1

### Patch Changes

- Updated dependencies [8080346]
    - @core-ai/google-genai@0.29.1
    - @core-ai/core-ai@0.29.1

## 0.29.0

### Minor Changes

- eb05b64: Re-export `GoogleThinkingBudgetRange`. Vertex-hosted Gemini 2.5 models use
  their documented thinking budget ranges, and an explicit `maxTokens` at or
  below the thinking budget throws `ValidationError`.

### Patch Changes

- Updated dependencies [eb05b64]
- Updated dependencies [eb05b64]
    - @core-ai/google-genai@0.29.0
    - @core-ai/core-ai@0.29.0

## 0.28.1

### Patch Changes

- @core-ai/core-ai@0.28.1
- @core-ai/google-genai@0.28.1

## 0.28.0

### Patch Changes

- @core-ai/core-ai@0.28.0
- @core-ai/google-genai@0.28.0

## 0.27.1

### Patch Changes

- @core-ai/core-ai@0.27.1
- @core-ai/google-genai@0.27.1

## 0.27.0

### Patch Changes

- @core-ai/core-ai@0.27.0
- @core-ai/google-genai@0.27.0

## 0.26.0

### Patch Changes

- @core-ai/core-ai@0.26.0
- @core-ai/google-genai@0.26.0

## 0.25.0

### Patch Changes

- d98a0cb: Report per-tool strict schemas as unsupported in model capabilities; a tool with `strict: true` throws `ToolSchemaStrictnessError` before any provider I/O.
- Updated dependencies [d98a0cb]
- Updated dependencies [d98a0cb]
    - @core-ai/core-ai@0.25.0
    - @core-ai/google-genai@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies [5524a95]
- Updated dependencies [d65aa5a]
    - @core-ai/google-genai@0.24.0
    - @core-ai/core-ai@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [a4d08b7]
- Updated dependencies [a4d08b7]
    - @core-ai/google-genai@0.23.0
    - @core-ai/core-ai@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies [717364e]
    - @core-ai/core-ai@0.22.0
    - @core-ai/google-genai@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [37c890d]
    - @core-ai/core-ai@0.21.0
    - @core-ai/google-genai@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [05515dc]
- Updated dependencies [7281534]
- Updated dependencies [7281534]
    - @core-ai/core-ai@0.20.0
    - @core-ai/google-genai@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [de380ee]
- Updated dependencies [de380ee]
- Updated dependencies [b087061]
- Updated dependencies [b087061]
    - @core-ai/core-ai@0.19.0
    - @core-ai/google-genai@0.19.0

## 0.18.0

### Patch Changes

- @core-ai/core-ai@0.18.0
- @core-ai/google-genai@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [5a720e8]
- Updated dependencies [5a720e8]
- Updated dependencies [f6a6f5b]
- Updated dependencies [f6a6f5b]
    - @core-ai/core-ai@0.17.0
    - @core-ai/google-genai@0.17.0

## 0.16.0

### Patch Changes

- @core-ai/core-ai@0.16.0
- @core-ai/google-genai@0.16.0

## 0.15.0

### Minor Changes

- f579bcb: Add `@core-ai/google-vertex` for Gemini, embedding, and Imagen models on Google Vertex AI with Application Default Credentials or explicit service-account authentication.

### Patch Changes

- Updated dependencies [f579bcb]
- Updated dependencies [f579bcb]
- Updated dependencies [381fd9d]
    - @core-ai/google-genai@0.15.0
    - @core-ai/core-ai@0.15.0
