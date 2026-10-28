# @core-ai/core-ai

## 0.36.1

## 0.36.0

### Minor Changes

- aa18a92: Add `toPortableToolName()`, which returns a tool name every provider accepts: valid names unchanged, any other name with invalid characters replaced by `_`, a leading `_` where needed, and at most 128 characters. Characters are replaced per UTF-16 code unit, and the result depends only on the name, so it stays the same across releases. Use it for names you do not control, such as MCP tool names, check that the converted names stay unique, and map tool calls back to the original name.
- aa18a92: Add `ModelCapabilities.tools.strictSchemas.maxUnionParameters`, a per-request limit on union-typed parameters (properties whose schema is an `anyOf`, a `oneOf`, or a `type` array with more than one entry, nullable keys included) across a request's strict tools. Strict tools beyond it throw `ToolSchemaStrictnessError` with the new reason `'union-limit-exceeded'` and its `maxUnionParameters` and `unionParameterCount` fields before the provider request.

    **Type change:** `ToolSchemaStrictnessErrorReason` gains `'union-limit-exceeded'`, so exhaustive switches over it must handle it.

- aa18a92: Add tool discovery. With `toolDiscovery` set on `generate` / `stream`, core-ai declares a discovery tool; the model's calls to it arrive as `ToolDiscoveryCall`s in the new `result.discoveryCalls` (never in `toolCalls`; in `parts` as `ToolDiscoveryCallPart`s wrapping them, streamed as one `tool-discovery-call` event), and the application answers each with a `ToolDiscoveryResultMessage` (`discoveryCallId`) listing `ToolSnapshot`s (tool definitions with plain JSON Schema parameters), or no tools and an optional `note` explaining why. Discovered tools are then callable by their real names on every provider and stay declared while their results are in the history. `finishReason: 'tool-calls'` covers pending discovery calls, so loop on `finishReason` and answer both `toolCalls` and `discoveryCalls`. Discovery calls pair with their results per step. Malformed discovery histories, a `note` next to tools, a tool name listed twice in one result, reserved tool names, snapshot names some provider rejects (only letters, digits, underscores, and dashes, starting with a letter or underscore, up to 128 characters), snapshot `parameters` that are not an object schema with `type: "object"` at the root, and a `toolChoice` naming a non-caller tool throw `ValidationError` before any provider call, also on `generateObject` / `streamObject`, which declare no discovered tools. Every strict snapshot in the history, including ones a later discovery replaced while the latest snapshot of that name is strict, is checked against the strict-capable schema contract on every model by `generate` / `stream` (structured output declares no snapshot and skips it), and declared without `strict` on models without strict tool support or beyond their `maxStrictTools` or `maxUnionParameters` limit.

    **Type change:** `ModelCapabilities` gains a required `tools.toolDiscovery` field (`'native' | 'emulated'`) and `GenerateResult` a required `discoveryCalls` array, so code that builds either by hand must add them. `Message`, `AssistantContentPart`, and `StreamEvent` gain the new members, so exhaustive switches over them must handle them. Adds adapter helpers (`resolveToolDiscovery`, `getEmulatedToolSet`, `emulateToolDiscoveryMessages`, `getStructuredOutputMessages`, and others); `finalizeGenerateResult` and the `request` option of `createChatStream` turn calls to the discovery tool into discovery calls.

- aa18a92: `ToolDiscoveryResultMessage` accepts `providerOptions`, typed by the new `ToolDiscoveryResultMessageProviderOptions` interface for provider packages to augment; emulated rendering forwards them to the tool result the discovery result becomes. Adds the adapter helper `getDiscoveryCalls`.

## 0.35.0

### Minor Changes

- 8759754: Add `MediaCountExceededError` and its subclass `ImageCountExceededError`, non-retryable `ProviderError`s for requests that carry more media inputs (images, document pages) or more images than the provider or model accepts. Both expose `maxMedia` / `actualMedia` when the provider reports them.
- 3dd9026: **Breaking:** tool `parameters` and `generateObject` / `streamObject` schemas accept any [Standard Schema](https://standardschema.dev) that implements Standard JSON Schema (Zod 4.2+, ArkType, Valibot via `toStandardJsonSchema()`, and others) or plain JSON Schema of any object type, including `JSONSchema7`, which is sent byte for byte. Zod is no longer a dependency of `@core-ai/core-ai`, and its public types no longer reference Zod. Zod 4.0–4.1 and `zod/mini` schemas lack Standard JSON Schema and now throw a `ValidationError`: upgrade Zod, or pass `z.toJSONSchema(schema)` as plain JSON Schema and validate yourself.

    `generateObject` returns the validated, typed object for Standard Schemas and the parsed JSON as `unknown` for plain JSON Schema. A structured output validator that throws becomes a `StructuredOutputValidationError` with the error as its `cause`. Adds `validateToolCall(tool, toolCall)`, which validates a tool call's arguments with the tool's Standard Schema and returns the typed result (`{ value }` or `{ issues }`, never thrown, even when the validator itself throws), or `undefined` for plain JSON Schema parameters.

    The strict tool contract accepts optional keys that accept `null` or declare a `default`; strict-capable providers receive them as required. Other optional keys are still rejected.

    Adds `toJsonSchema()`, which returns the JSON Schema core-ai derives from a schema, and replaces `zodSchemaToJsonSchema()`. Adds the `SchemaInput`, `StandardSchemaWithJson`, `JsonSchema`, `InferSchemaOutput`, and `ToolCallValidation` types, re-exports the Standard Schema type namespaces, and adds adapter helpers (`getToolJsonSchema`, `normalizeStructuredOutputSchema`, `parseStructuredOutput`, `extractStructuredObject`, `transformStructuredOutputStream`, `requireEveryKey`, and `mapChildSchemaNodes`).

## 0.34.0

## 0.33.0

## 0.32.0

### Minor Changes

- fbf70a5: `UserMessage` and `ToolResultMessage` gain `providerOptions`, keyed by provider id, with the new `UserMessageProviderOptions` and `ToolResultMessageProviderOptions` interfaces for provider packages to augment.

## 0.31.0

### Minor Changes

- 76d8ba6: **Breaking:** `ModelCapabilities` gains a required `messages.systemPlacement` field (`'leading' | 'before-reply' | 'anywhere'`) describing where a model accepts system messages after the first non-system message. Custom `ChatModel` implementations and capability registries must add it. Adds `validateSystemMessagePlacement()`, which provider adapters run before every request and which throws the new `UnsupportedSystemMessagePlacementError`, and `getSystemMessagePlacementIssues()` to check a conversation without sending it. `validateMessages()` runs every message-level capability check (input modalities and system message placement) in one call. `SystemMessage` gains `providerOptions`, keyed by provider id.

## 0.30.0

## 0.29.1

## 0.29.0

### Minor Changes

- eb05b64: Define `maxTokens` as the total output allowance, covering reasoning tokens and
  the visible answer. An omitted `maxTokens` means the model's output ceiling,
  and adapters reject an explicit limit that cannot hold the reasoning budget of
  the requested effort instead of shrinking the budget.

    Add optional `ModelCapabilities.output.maxTokens`, the verified output ceiling
    for a model id. It is absent when the ceiling is unknown.

## 0.28.1

## 0.28.0

## 0.27.1

## 0.27.0

## 0.26.0

## 0.25.0

### Minor Changes

- d98a0cb: Add per-tool strict tool schemas: `defineTool` accepts `strict: true` to opt a single tool into provider-enforced schema adherence, `ModelCapabilities.tools.strictSchemas` reports model support, and `validateToolSchemaStrictness` validates strict tools against the strict-capable schema contract (an object root, closed objects, every key required — use `.nullable()` instead of `.optional()` — and the keyword subset every strict-capable provider accepts; `z.discriminatedUnion()` is supported, `z.intersection()` and `z.url()` are not). Violations throw `ToolSchemaStrictnessError` with reason `'unsupported'`, `'limit-exceeded'`, or `'invalid-schema'` and a `violations` list naming each offending schema path. Also exports `normalizeStrictJsonSchema` and `getStrictToolSchemaViolations`. **Type change:** `ModelCapabilities` gains a required `tools.strictSchemas` field, so code that builds capabilities by hand (custom `modelCapabilities` registries, middleware, test fixtures) must add it — use `SUPPORTED_TOOL_SCHEMA_STRICTNESS` or `UNSUPPORTED_TOOL_SCHEMA_STRICTNESS`.

## 0.24.0

### Minor Changes

- d65aa5a: Add `ProviderQuotaExceededError` and normalize non-retryable provider billing and exhausted-credit failures.

## 0.23.0

### Minor Changes

- a4d08b7: Add `ProviderError.code` so adapters can lift the provider's machine-readable error identifier, and `createChatStream({ mapError })` so in-band stream failures use the same typed errors as the initial request.

## 0.22.0

### Minor Changes

- 717364e: Allow application-owned metadata on image, file, and audio input parts.

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
