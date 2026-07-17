# @core-ai/azure-openai

## 0.17.0

### Patch Changes

- Updated dependencies [5a720e8]
- Updated dependencies [15b9ba6]
- Updated dependencies [5a720e8]
- Updated dependencies [f6a6f5b]
- Updated dependencies [f6a6f5b]
    - @core-ai/core-ai@0.17.0
    - @core-ai/openai@0.17.0

## 0.16.0

### Patch Changes

- @core-ai/core-ai@0.16.0
- @core-ai/openai@0.16.0

## 0.15.0

### Minor Changes

- caebeb3: Azure OpenAI v1 uses the Responses API by default. Strict Chat Completions are available at `azure.chat.chatModel()`. Classic API access is unchanged.

### Patch Changes

- 6d4e4d8: Select `max_completion_tokens` automatically for known OpenAI model IDs used with Azure Chat Completions while keeping `max_tokens` for unknown deployment names.
- Updated dependencies [381fd9d]
- Updated dependencies [6d4e4d8]
- Updated dependencies [caebeb3]
    - @core-ai/core-ai@0.15.0
    - @core-ai/openai@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [8e64097]
    - @core-ai/core-ai@0.14.0
    - @core-ai/openai@0.14.0

## 0.13.1

### Patch Changes

- c7362c7: Bump openai SDK from 6.23.0 to 6.46.0 for GPT-5.6 API types and Responses API fixes.
- Updated dependencies [c7362c7]
    - @core-ai/openai@0.13.1
    - @core-ai/core-ai@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [7bf38dd]
- Updated dependencies [de090e2]
    - @core-ai/openai@0.13.0
    - @core-ai/core-ai@0.13.0

## 0.12.0

### Patch Changes

- @core-ai/core-ai@0.12.0
- @core-ai/openai@0.12.0

## 0.11.1

### Patch Changes

- 43d926e: Add `require` and `default` export conditions so packages resolve under CommonJS loaders such as tsx.
- Updated dependencies [43d926e]
    - @core-ai/core-ai@0.11.1
    - @core-ai/openai@0.11.1

## 0.11.0

### Minor Changes

- f1206de: Add the Azure OpenAI chat provider with v1 Chat Completions support by default, classic API fallback, live E2E adapter coverage, docs, and a runnable example.

### Patch Changes

- Updated dependencies [27601f7]
- Updated dependencies [b077b82]
- Updated dependencies [b077b82]
    - @core-ai/openai@0.11.0
    - @core-ai/core-ai@0.11.0
