# @core-ai/core-ai

## 0.21.0

### Minor Changes

- 37c890d: Add optional application-owned `metadata` to `SystemMessage`. Provider adapters ignore it and never serialize it to provider APIs.

## 0.20.0

### Minor Changes

- 7281534: Add `providerMetadata` to `ToolCallPart` and the `tool-call-end` stream event so provider-owned data attached to a tool call, such as a Google thought signature, survives aggregation and can be replayed with the call.

### Patch Changes

- 05515dc: Document that reasoning `providerMetadata` treats `openai` and `azure-openai` as distinct ownership namespaces.

## 0.19.0

### Minor Changes

- de380ee: Add base64 `AudioPart` user content and validate audio through the existing directional input modality capabilities. Code that exhaustively handles `UserContentPart` must add an `'audio'` branch.
- b087061: Add chat modality capabilities as directional arrays on `ModelCapabilities.modalities`: `input` (`ChatInputModality[]`) and `output` (`ChatOutputModality[]`). Common presets (`TEXT_ONLY_MODALITIES`, `MULTIMODAL_INPUT_MODALITIES`) and helpers (`supportsInputModality`, `supportsOutputModality`) are exported. Multimodal chat models advertise `['text', 'image', 'file']` input; audio and video remain reserved until dedicated user content parts exist.

    The new `validateInputModalities` helper rejects any user content parts whose modalities are missing from `capabilities.modalities.input`, and throws `UnsupportedInputModalityError` (a `ValidationError`) with the requested, supported, and unsupported modality lists. Provider adapters run the same check before sending a request.

    `modalities` is required, so custom `ChatModel` implementations and custom `ModelCapabilitiesRegistry` values must add it.

## 0.18.0

## 0.17.0

### Minor Changes

- 5a720e8: Add a reusable model capabilities registry with normalized model ID lookup, a symbol-keyed fallback for unknown models, and explicit reasoning modes, sampling constraints, and supported tool choices.
- f6a6f5b: Add structured `ProviderError` subclasses (`ContextLengthExceededError`, `RateLimitError`, `ModelOverloadedError`, `ServiceUnavailableError`) with a `RetryableProviderError` base for transient failures. Providers decide which subclass to throw; core exports shared extraction helpers only, including `retry-after-ms` and HTTP-date `Retry-After` parsing.

## 0.16.0

## 0.15.0

### Patch Changes

- 381fd9d: Normalize dated Vertex model IDs for capability detection.

## 0.14.0

### Minor Changes

- 8e64097: Add application-owned metadata to text-bearing message parts and text boundary stream events.

## 0.13.1

## 0.13.0

### Minor Changes

- de090e2: Expose a shared ModelCapabilities contract on ChatModel and via provider get\*ModelCapabilities helpers so consumers can inspect reasoning support without duplicating provider maps.

## 0.12.0

## 0.11.1

### Patch Changes

- 43d926e: Add `require` and `default` export conditions so packages resolve under CommonJS loaders such as tsx.

## 0.11.0

### Patch Changes

- b077b82: Normalize provider model IDs with dashed `YYYY-MM-DD` snapshot suffixes so current model aliases and snapshots share capability handling.

## 0.10.3

## 0.10.2

## 0.10.1

## 0.10.0

## 0.9.0

### Minor Changes

- 657ca1f: Add model-level middleware wrappers (`wrapChatModel`, `wrapEmbeddingModel`, `wrapImageModel`) to core-ai and provide first-party OpenTelemetry middleware in `@core-ai/opentelemetry` via `createOtelMiddleware`, `createOtelEmbeddingMiddleware`, and `createOtelImageMiddleware`.

## 0.8.0

### Minor Changes

- abb5d6f: Standardize library error handling with `CoreAIError`, `ValidationError`, and provider-aware abort errors.

## 0.7.1

### Patch Changes

- 3f8addd: Refactor stream internals to reduce duplicate terminal state and result aggregation logic without changing behavior.
- d94fd45: Refactor shared model-id, provider utility, and capability mapping helpers across providers without changing public behavior.

## 0.7.0

### Minor Changes

- 7ed8b49: **Breaking:** Require Zod 4 (`^4.0.0`) and replace `zod-to-json-schema` with Zod 4's native `z.toJSONSchema()`. The `zod-to-json-schema` library produced empty JSON schemas for Zod 4 schemas, breaking tool parameter conversion. A new `zodSchemaToJsonSchema` utility is exported from `@core-ai/core-ai` for consumers that need direct Zod-to-JSON-Schema conversion.

## 0.6.1

### Patch Changes

- 3b599ab: Refactor internal chat/image wrapper plumbing and stream event reduction logic to reduce duplication and improve readability without changing public behavior.

## 0.6.0

### Minor Changes

- 308a307: Replace `ModelConfig` with flat sampling fields (`temperature`, `maxTokens`, `topP`) on generate options. Introduce method-specific typed provider option interfaces (`GenerateProviderOptions`, `EmbedProviderOptions`, `ImageProviderOptions`) that providers extend via declaration merging, replacing the untyped `Record<string, unknown>`.
- dbe063d: Restructure reasoning `providerMetadata` to use provider-namespaced keys (e.g. `{ anthropic: { signature: '...' } }`). Adapters now detect cross-provider reasoning blocks and downgrade them to plain text instead of forwarding opaque metadata. Add `getProviderMetadata` helper to `@core-ai/core-ai`.
- c6882e4: Redesign chat and object streaming around replayable stream handles with `result` and `events`, rename the handle types to `ChatStream` and `ObjectStream`, and accept caller-provided `AbortSignal`s for cancellation.

## 0.5.1

### Patch Changes

- 6627888: Fix release publish race: remove prepublishOnly to avoid concurrent tsup builds failing to resolve @core-ai/core-ai.

## 0.5.0

### Minor Changes

- b407153: Add unified reasoning/thinking support with effort-based configuration.

    BREAKING CHANGES:
    - `AssistantMessage`: `content` and `toolCalls` fields replaced by `parts: AssistantContentPart[]` array
    - `StreamEvent`: `content-delta` renamed to `text-delta`, new `reasoning-start`, `reasoning-delta`, `reasoning-end` events added
    - `GenerateResult`: adds required `parts` and `reasoning` fields
    - `ChatOutputTokenDetails.reasoningTokens`: changed from `number` to optional — omitted when the provider does not report a breakdown

    New types: `ReasoningEffort`, `ReasoningConfig`, `AssistantContentPart`, `ReasoningPart`
    New utilities: `resultToMessage()` for multi-turn reasoning state preservation, `assistantMessage()` for convenient message construction
    New option: `reasoning?: ReasoningConfig` on `GenerateOptions`, `GenerateObjectOptions`, `StreamObjectOptions`

## 0.4.0

### Minor Changes

- 9664af0: Refactor the core `ChatUsage` contract to nested detail objects for input and
  output token accounting.

    This is a breaking change:
    - remove `usage.totalTokens`
    - move `usage.reasoningTokens` to `usage.outputTokenDetails.reasoningTokens`
    - add `usage.inputTokenDetails.{cacheReadTokens,cacheWriteTokens}`

    Consumers should update any direct usage-field access to the new nested shape.

## 0.3.0

### Minor Changes

- 8b1540e: Add first-class structured output support with `generateObject()` and
  `streamObject()` across core and all provider chat models.

    This introduces schema-driven typed object generation, structured output
    streaming events, and standardized structured-output errors while keeping
    provider strategy logic inside provider packages.

- 5f3df42: Clarify embedding usage semantics by making `EmbedResult.usage` optional in the
  core API contract, so providers can return `usage: undefined` when token counts
  are not exposed by the underlying API.

    Update Google GenAI embedding behavior to only include usage when token
    statistics are present, and add provider E2E contract coverage for cross-
    provider live validation.

## 0.2.1

### Patch Changes

- 37e0cc6: Broaden Zod compatibility to support both Zod 3 and Zod 4 across all packages.

    This updates published Zod ranges and raises the minimum `zod-to-json-schema`
    version to one that supports Zod 4, preventing peer dependency conflicts for
    projects already using Zod 4.

## 0.2.0
