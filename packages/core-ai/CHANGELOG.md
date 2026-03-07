# @core-ai/core-ai

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
