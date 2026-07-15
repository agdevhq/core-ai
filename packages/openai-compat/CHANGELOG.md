# @core-ai/openai-compat

## 0.16.0

### Patch Changes

- @core-ai/core-ai@0.16.0
- @core-ai/openai@0.16.0

## 0.15.0

### Minor Changes

- caebeb3: Add `@core-ai/openai-compat` as a standalone Chat Completions provider for OpenAI-compatible gateways. Configure nonstandard reasoning extraction and structured output transport independently with `reasoning` and `structuredOutputMode`.

### Patch Changes

- 6d4e4d8: Select the Chat Completions token-limit parameter automatically for known OpenAI models while keeping `max_tokens` as the compatibility default for unknown models. Set `maxTokensParameter` on the provider to configure a different compatibility default.
- Updated dependencies [381fd9d]
- Updated dependencies [6d4e4d8]
- Updated dependencies [caebeb3]
    - @core-ai/core-ai@0.15.0
    - @core-ai/openai@0.15.0
