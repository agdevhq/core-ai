# @core-ai/mistral

## 0.19.0

### Minor Changes

- de380ee: Reject unsupported audio user content before converting it to Mistral document input.
- b087061: Resolve capabilities per model instead of returning one shared value. Vision families (`mistral-large`, `mistral-medium`, `mistral-small`, `magistral-*`, `ministral-*`, `pixtral-*`) advertise `modalities.input: ['text', 'image', 'file']`, while text-only families (`codestral`, `devstral-*`, `open-mistral-*`, `open-mixtral-*`) advertise `['text']` and reject images before the request is sent. Unknown model IDs stay multimodal capable. `modalities.output` is `['text']` for all chat models.

    Lookup prefers an exact model ID and falls back to the family with the `-latest` alias and `-YYMM` version suffix removed. Mistral added vision to each family at a specific release, so pinned versions from before that release are reported as text-only: Mistral Large before `-2512`, Mistral Small before `-2503`, Magistral before `-2509`, and Ministral before `-2512`.

### Patch Changes

- Updated dependencies [de380ee]
- Updated dependencies [b087061]
    - @core-ai/core-ai@0.19.0

## 0.18.0

### Patch Changes

- @core-ai/core-ai@0.18.0

## 0.17.0

### Minor Changes

- f6a6f5b: Map Mistral SDK failures to structured `ProviderError` subclasses in `wrapMistralError`, including service-tier capacity as unavailable and client timeouts as retryable unavailable.

### Patch Changes

- 9cee947: Preserve historical reasoning when sending conversation history to Mistral. Native Mistral reasoning is replayed as a thinking chunk only when the target model supports reasoning input; otherwise (foreign reasoning, or a model that does not support reasoning such as codestral) it is injected into the assistant message as `<thinking>` text. This matches the OpenAI, Anthropic, and Kimi adapters and avoids replaying thinking chunks to models that reject them.
- Updated dependencies [5a720e8]
- Updated dependencies [f6a6f5b]
    - @core-ai/core-ai@0.17.0

## 0.16.0

### Minor Changes

- 5e57ec7: Upgrade `@mistralai/mistralai` to v2 and use its package exports for error and component imports.

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

### Minor Changes

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

- c06e653: Refactor adapter internals to reduce duplication and simplify stream/request helper logic without changing runtime behavior.
- Updated dependencies [3b599ab]
    - @core-ai/core-ai@0.6.1

## 0.6.0

### Minor Changes

- 308a307: Namespace provider options under `mistral` key with Zod validation. Generate options: `stopSequences`, `frequencyPenalty`, `presencePenalty`, `randomSeed`, `parallelToolCalls`, `promptMode`, `safePrompt`. Embed options: `outputDtype`, `encodingFormat`, `metadata`.
- dbe063d: Restructure reasoning `providerMetadata` to use provider-namespaced keys (e.g. `{ anthropic: { signature: '...' } }`). Adapters now detect cross-provider reasoning blocks and downgrade them to plain text instead of forwarding opaque metadata. Add `getProviderMetadata` helper to `@core-ai/core-ai`.
- c6882e4: Update provider streaming adapters to expose replayable stream handles using the new `ChatStream` and `ObjectStream` types.

### Patch Changes

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

- b407153: Add reasoning support for Mistral Magistral models. Extracts thinking chunks from response content and streams as reasoning events. No effort mapping needed as Magistral models always reason at full capacity.

### Patch Changes

- Updated dependencies [b407153]
    - @core-ai/core-ai@0.5.0

## 0.4.0

### Minor Changes

- 9664af0: Update Mistral usage mapping to the new nested `ChatUsage` structure.

    Mistral usage now reports cache and reasoning details in nested fields with zero
    defaults:
    - `usage.inputTokenDetails.cacheReadTokens = 0`
    - `usage.inputTokenDetails.cacheWriteTokens = 0`
    - `usage.outputTokenDetails.reasoningTokens = 0`

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

### Minor Changes

- ff7da7c: Add a new `@core-ai/mistral` provider package powered by the latest
  `@mistralai/mistralai` SDK, including chat generation, streaming, tool-calling,
  and embeddings support.

### Patch Changes

- @core-ai/core-ai@0.2.0
