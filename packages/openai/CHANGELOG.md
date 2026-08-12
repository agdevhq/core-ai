# @core-ai/openai

## 0.20.0

### Minor Changes

- 05515dc: Namespace Responses API encrypted reasoning under each wrapper's `providerId` instead of always using `openai`. Foreign namespaces (e.g. `azure-openai`) downgrade to thinking text; same-namespace ciphertext still round-trips.

### Patch Changes

- Updated dependencies [05515dc]
- Updated dependencies [7281534]
    - @core-ai/core-ai@0.20.0

## 0.19.0

### Minor Changes

- de380ee: Accept WAV and MP3 audio input on supported Chat Completions audio models while keeping the Responses API and unknown models audio-unsupported.
- b087061: Report chat modalities per model. GPT-4 / GPT-5 families, `o1`, `o3`, `o3-pro`, and `o4-mini` advertise `modalities.input: ['text', 'image', 'file']`; `gpt-3.5-turbo`, `o1-mini`, and `o3-mini` are text-only. Unknown model IDs stay multimodal capable. Both the Responses and Chat Completions adapters reject images for text-only models before calling the API. `modalities.output` is `['text']` for all chat models.

    The Responses adapter now resolves capabilities and the provider id from the chat model instead of always reading the first-party OpenAI registry. Providers built on `createOpenAIProvider` (such as `@core-ai/azure-openai`) therefore validate against their own capability registry and tag `ValidationError.provider` with their own id.

### Patch Changes

- Updated dependencies [de380ee]
- Updated dependencies [b087061]
    - @core-ai/core-ai@0.19.0

## 0.18.0

### Patch Changes

- @core-ai/core-ai@0.18.0

## 0.17.0

### Minor Changes

- 5a720e8: Add native reasoning round trips, JSON object structured output, capability-driven request validation, provider-specific option namespaces, and support for overriding model capabilities through a shared registry. The structured output mode is now named `json-schema` instead of `native`.
- f6a6f5b: Map OpenAI / Azure / OpenAI-compatible SDK failures to structured `ProviderError` subclasses in `wrapOpenAIError`, including non-retryable `insufficient_quota` and Azure `NoCapacity` overload.

### Patch Changes

- 15b9ba6: Convert historical reasoning to assistant text for OpenAI models that do not support reasoning input.
- Updated dependencies [5a720e8]
- Updated dependencies [f6a6f5b]
    - @core-ai/core-ai@0.17.0

## 0.16.0

### Patch Changes

- @core-ai/core-ai@0.16.0

## 0.15.0

### Minor Changes

- caebeb3: Root `createOpenAI()` uses the Responses API by default. Strict Chat Completions are available at `openai.chat.chatModel()`. Object generation prefers native strict JSON Schema output. The shared provider factory now exposes compatibility options for reasoning extraction and structured output transport.

### Patch Changes

- 6d4e4d8: Map `maxTokens` to `max_completion_tokens` for known GPT-5 and o-series models when using strict Chat Completions. Unknown model IDs keep the broadly compatible `max_tokens` parameter.
- Updated dependencies [381fd9d]
    - @core-ai/core-ai@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [8e64097]
    - @core-ai/core-ai@0.14.0

## 0.13.1

### Patch Changes

- c7362c7: Bump openai SDK from 6.23.0 to 6.46.0 for GPT-5.6 API types and Responses API fixes.
    - @core-ai/core-ai@0.13.1

## 0.13.0

### Minor Changes

- 7bf38dd: Add GPT-5.6 Sol, Terra, and Luna model capability handling.
- de090e2: Expose a shared ModelCapabilities contract on ChatModel and via provider get\*ModelCapabilities helpers so consumers can inspect reasoning support without duplicating provider maps.

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

### Minor Changes

- 27601f7: Add `@core-ai/omnifact` provider for the Omnifact API Gateway with a default production base URL. Export `createOpenAICompatChatModel` from `@core-ai/openai/compat` and allow a custom provider id in the compat chat layer.
- b077b82: Add explicit capability handling and docs for recent OpenAI models including GPT-5.5, GPT-5.4 mini/nano, GPT-5.3 Codex, GPT-5 Pro, o3-pro, and GPT Image 2.

### Patch Changes

- Updated dependencies [b077b82]
    - @core-ai/core-ai@0.11.0

## 0.10.3

### Patch Changes

- 261305a: Preserve spacing between OpenAI reasoning summary parts.
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

### Patch Changes

- Updated dependencies [657ca1f]
    - @core-ai/core-ai@0.9.0

## 0.8.0

### Minor Changes

- abb5d6f: Standardize library error handling with `CoreAIError`, `ValidationError`, and provider-aware abort errors.

### Patch Changes

- Updated dependencies [abb5d6f]
    - @core-ai/core-ai@0.8.0

## 0.7.1

### Patch Changes

- 5b66e51: Refactor OpenAI structured output, provider factory wiring, option parsing, and reasoning transition handling without changing public behavior.
- d94fd45: Refactor shared model-id, provider utility, and capability mapping helpers across providers without changing public behavior.
- Updated dependencies [3f8addd]
- Updated dependencies [d94fd45]
    - @core-ai/core-ai@0.7.1

## 0.7.0

### Minor Changes

- 7ed8b49: **Breaking:** Require Zod 4 (`^4.0.0`) and replace `zod-to-json-schema` with Zod 4's native `z.toJSONSchema()`. The `zod-to-json-schema` library produced empty JSON schemas for Zod 4 schemas, breaking tool parameter conversion. A new `zodSchemaToJsonSchema` utility is exported from `@core-ai/core-ai` for consumers that need direct Zod-to-JSON-Schema conversion.

### Patch Changes

- Updated dependencies [7ed8b49]
    - @core-ai/core-ai@0.7.0

## 0.6.1

### Patch Changes

- ccca3e9: Add model capability support for gpt-5.4 and gpt-5.4-pro.
- 2889c04: Refactor OpenAI chat adapter internals to reduce duplicated stream and part-aggregation logic, and consistently report `finishReason: 'tool-calls'` when a function call is emitted from the stream.
- Updated dependencies [3b599ab]
    - @core-ai/core-ai@0.6.1

## 0.6.0

### Minor Changes

- dbe063d: Migrate `@core-ai/openai` default chat models to the OpenAI Responses API and add a `@core-ai/openai/compat` entrypoint for Chat Completions compatibility. This also adds dedicated OpenAI compat E2E coverage and provider-targeted E2E scripts.
- 308a307: Namespace provider options under `openai` key with Zod validation. Responses API generate options: `store`, `serviceTier`, `include`, `parallelToolCalls`, `user`. Compat (Chat Completions) adds `stopSequences`, `frequencyPenalty`, `presencePenalty`, `seed`. Embed options: `encodingFormat`, `user`. Image options: `background`, `moderation`, `outputCompression`, `outputFormat`, `quality`, `responseFormat`, `style`, `user`.
- c6882e4: Update provider streaming adapters to expose replayable stream handles using the new `ChatStream` and `ObjectStream` types.

### Patch Changes

- be5f32a: Refactor adapter internals to remove duplicated request assembly and reasoning stream cleanup logic without changing behavior.
- Updated dependencies [308a307]
- Updated dependencies [dbe063d]
- Updated dependencies [c6882e4]
    - @core-ai/core-ai@0.6.0

## 0.5.1

### Patch Changes

- 6627888: Fix release publish race: remove prepublishOnly to avoid concurrent tsup builds failing to resolve @core-ai/core-ai.
- Updated dependencies [6627888]
    - @core-ai/core-ai@0.5.1

## 0.5.0

### Minor Changes

- b407153: Add reasoning support for OpenAI models (Chat Completions API). Maps unified `reasoning.effort` to `reasoning_effort` with model-aware clamping. Extracts reasoning content from responses and streams. Validates parameter restrictions for GPT-5.1+ models (temperature/topP incompatible with reasoning). Adds model capability registry for effort range and parameter restriction detection.

### Patch Changes

- Updated dependencies [b407153]
    - @core-ai/core-ai@0.5.0

## 0.4.0

### Minor Changes

- 9664af0: Update OpenAI usage mapping to the new nested `ChatUsage` structure.

    OpenAI responses now map cache and reasoning metrics into:
    - `usage.inputTokenDetails.cacheReadTokens` from `prompt_tokens_details.cached_tokens`
    - `usage.outputTokenDetails.reasoningTokens` from `completion_tokens_details.reasoning_tokens`

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

### Patch Changes

- @core-ai/core-ai@0.2.0
