# @core-ai/kimi

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
