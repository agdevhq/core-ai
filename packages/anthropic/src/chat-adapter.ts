import type {
    RawMessageStreamEvent,
    StopReason,
    ToolUseBlock,
    ContentBlockParam,
    MessageParam,
    Tool,
    ToolChoice,
    TextBlockParam,
    ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages/messages';
import type { z } from 'zod';
import {
    asObject,
    clampReasoningEffort,
    getProviderMetadata,
    ValidationError,
    safeParseJsonObject,
    validateMessages,
    validateToolSchemaStrictness,
    zodSchemaToJsonSchema,
} from '@core-ai/core-ai';

export { wrapAnthropicError } from './anthropic-error.ts';
import type {
    FinishReason,
    GenerateObjectOptions,
    GenerateOptions,
    Message,
    ModelCapabilities,
    StreamEvent,
    SystemMessage,
    ToolSet,
    UserContentPart,
    ToolChoice as AgToolChoice,
} from '@core-ai/core-ai';
import {
    getAnthropicModelCapabilities,
    getAnthropicThinkingMode,
    getAnthropicDefaultTopP,
    rejectsAnthropicCombinedSamplingParams,
    rejectsAnthropicForcedToolChoiceAlways,
    requiresAnthropicInterleavedThinkingBeta,
    restrictsAnthropicSamplingParamsAlways,
    supportsAnthropicMaxEffort,
    toAnthropicAdaptiveEffort,
    toAnthropicManualBudget,
} from './model-capabilities.ts';
import {
    parseAnthropicGenerateProviderOptions,
    parseAnthropicSystemMessageProviderOptions,
    type AnthropicCacheControl,
    type AnthropicGenerateProviderOptions,
} from './provider-options.ts';

export type AnthropicReasoningMetadata = {
    signature?: string;
    redactedData?: string;
};

/**
 * Default provider id attributed to generation, streaming, and validation
 * errors when no provider id is given. Callers wrapping the native Anthropic
 * client (e.g. `@core-ai/anthropic-vertex`) pass their own provider id
 * instead so errors and `ChatModel.provider` reflect the actual provider.
 */
export const DEFAULT_PROVIDER_ID = 'anthropic';

const UNSUPPORTED_ANTHROPIC_SCHEMA_KEYWORDS = new Set([
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
    'minLength',
    'maxLength',
    'maxItems',
]);

export type AnthropicCacheTtl = NonNullable<AnthropicCacheControl['ttl']>;

export type ConvertedAnthropicMessages = {
    system: TextBlockParam[] | undefined;
    /** TTLs of explicit cache breakpoints, in render order. */
    cacheTtls: AnthropicCacheTtl[];
    messages: MessageParam[];
};

/**
 * System messages before the first non-system message become top-level
 * `system` blocks; later ones stay in place as `role: 'system'` messages.
 * Placement is validated beforehand against the model's capabilities.
 */
export function convertMessages(
    messages: Message[],
    provider = DEFAULT_PROVIDER_ID
): ConvertedAnthropicMessages {
    const system: TextBlockParam[] = [];
    const cacheTtls: AnthropicCacheTtl[] = [];
    const convertedMessages: MessageParam[] = [];
    let previousInputWasTool = false;

    for (const message of messages) {
        if (message.role === 'system') {
            const block = convertSystemMessage(message, provider);
            if (!block) {
                continue;
            }
            if (block.cache_control) {
                cacheTtls.push(block.cache_control.ttl ?? '5m');
            }

            if (convertedMessages.length === 0) {
                system.push(block);
            } else {
                convertedMessages.push({
                    role: 'system',
                    content: block.cache_control ? [block] : block.text,
                });
            }
            previousInputWasTool = false;
            continue;
        }

        if (message.role === 'user') {
            convertedMessages.push({
                role: 'user',
                content:
                    typeof message.content === 'string'
                        ? message.content
                        : message.content.map(convertUserContentPart),
            });
            previousInputWasTool = false;
            continue;
        }

        if (message.role === 'assistant') {
            const contentBlocks: ContentBlockParam[] = [];
            for (const part of message.parts) {
                if (part.type === 'text') {
                    contentBlocks.push({
                        type: 'text',
                        text: part.text,
                    });
                    continue;
                }

                if (part.type === 'tool-call') {
                    contentBlocks.push({
                        type: 'tool_use',
                        id: part.toolCall.id,
                        name: part.toolCall.name,
                        input: part.toolCall.arguments,
                    });
                    continue;
                }

                // 'anthropic' here is the shared reasoning-metadata namespace
                // key, not a provider id — it stays fixed even for sibling
                // providers like anthropic-vertex, so it is intentionally not
                // DEFAULT_PROVIDER_ID.
                const anthropicMeta =
                    getProviderMetadata<AnthropicReasoningMetadata>(
                        part.providerMetadata,
                        'anthropic'
                    );
                if (anthropicMeta == null) {
                    if (part.text.length > 0) {
                        contentBlocks.push({
                            type: 'text',
                            text: `<thinking>${part.text}</thinking>`,
                        });
                    }
                    continue;
                }

                const { signature, redactedData } = anthropicMeta;
                if (typeof redactedData === 'string') {
                    contentBlocks.push({
                        type: 'redacted_thinking',
                        data: redactedData,
                    } as unknown as ContentBlockParam);
                    continue;
                }

                if (typeof signature === 'string') {
                    contentBlocks.push({
                        type: 'thinking',
                        thinking: part.text,
                        signature,
                    } as unknown as ContentBlockParam);
                    continue;
                }

                if (part.text.length > 0) {
                    contentBlocks.push({ type: 'text', text: part.text });
                }
            }

            convertedMessages.push({
                role: 'assistant',
                content:
                    contentBlocks.length === 0
                        ? ''
                        : contentBlocks.length === 1 &&
                            contentBlocks[0]?.type === 'text'
                          ? contentBlocks[0].text
                          : contentBlocks,
            });
            previousInputWasTool = false;
            continue;
        }

        const toolResultBlock: ToolResultBlockParam = {
            type: 'tool_result',
            tool_use_id: message.toolCallId,
            content: message.content,
            ...(message.isError ? { is_error: true } : {}),
        };

        if (
            previousInputWasTool &&
            convertedMessages.at(-1)?.role === 'user' &&
            Array.isArray(convertedMessages.at(-1)?.content)
        ) {
            const lastMessage = convertedMessages.at(-1);
            if (lastMessage && Array.isArray(lastMessage.content)) {
                lastMessage.content.push(toolResultBlock);
            }
        } else {
            convertedMessages.push({
                role: 'user',
                content: [toolResultBlock],
            });
        }

        previousInputWasTool = true;
    }

    return {
        system: system.length > 0 ? system : undefined,
        cacheTtls,
        messages: convertedMessages,
    };
}

const MAX_CACHE_BREAKPOINTS = 4;

export type ValidateCacheBreakpointsOptions = {
    /** TTLs of explicit breakpoints, in render order. */
    cacheTtls: readonly AnthropicCacheTtl[];
    requestCacheControl: AnthropicCacheControl | undefined;
    /** TTL of an explicit breakpoint on the request's last block, if any. */
    lastBlockCacheTtl: AnthropicCacheTtl | undefined;
    providerId: string;
};

/**
 * Rejects cache breakpoints the Messages API refuses: more than 4 per
 * request (request-level automatic caching included), a 1h breakpoint after
 * a 5m one, and request-level caching whose TTL differs from an explicit
 * breakpoint on the block it lands on.
 */
export function validateCacheBreakpoints({
    cacheTtls,
    requestCacheControl,
    lastBlockCacheTtl,
    providerId,
}: ValidateCacheBreakpointsOptions): void {
    const requestTtl = requestCacheControl
        ? (requestCacheControl.ttl ?? '5m')
        : undefined;
    const ttls = requestTtl ? [...cacheTtls, requestTtl] : cacheTtls;

    if (ttls.length > MAX_CACHE_BREAKPOINTS) {
        throw new ValidationError(
            `Anthropic accepts at most ${MAX_CACHE_BREAKPOINTS} cache breakpoints per request, request-level cacheControl included; this request has ${ttls.length}.`,
            undefined,
            providerId
        );
    }

    const firstShortTtl = ttls.indexOf('5m');
    if (firstShortTtl !== -1 && ttls.indexOf('1h', firstShortTtl) !== -1) {
        throw new ValidationError(
            'Anthropic cache breakpoints must not increase in TTL: a 1h breakpoint cannot follow a 5m one. System messages render in order, request-level cacheControl last.',
            undefined,
            providerId
        );
    }

    if (
        requestTtl !== undefined &&
        lastBlockCacheTtl !== undefined &&
        requestTtl !== lastBlockCacheTtl
    ) {
        throw new ValidationError(
            `Request-level cacheControl (ttl ${requestTtl}) targets the last system message, whose own cacheControl has ttl ${lastBlockCacheTtl}; Anthropic requires matching TTLs.`,
            undefined,
            providerId
        );
    }
}

function getLastBlockCacheTtl(
    messages: readonly MessageParam[]
): AnthropicCacheTtl | undefined {
    const content = messages.at(-1)?.content;
    if (!Array.isArray(content)) {
        return undefined;
    }

    const lastBlock = content.at(-1);
    if (!lastBlock || !('cache_control' in lastBlock)) {
        return undefined;
    }

    return lastBlock.cache_control
        ? (lastBlock.cache_control.ttl ?? '5m')
        : undefined;
}

/**
 * Anthropic rejects text blocks without non-whitespace text. Such a system
 * message carries no instruction, so it is dropped (as other providers
 * accept it) unless it marks a cache breakpoint, which needs a block.
 */
function convertSystemMessage(
    message: SystemMessage,
    provider: string
): TextBlockParam | undefined {
    const cacheControl = parseAnthropicSystemMessageProviderOptions(
        message.providerOptions,
        provider
    )?.cacheControl;

    if (message.content.trim() === '') {
        if (cacheControl) {
            throw new ValidationError(
                'A system message with cacheControl must contain non-whitespace text; Anthropic cannot place a cache breakpoint on an empty block.',
                undefined,
                provider
            );
        }
        return undefined;
    }

    return {
        type: 'text',
        text: message.content,
        ...(cacheControl ? { cache_control: cacheControl } : {}),
    };
}

function convertUserContentPart(part: UserContentPart): ContentBlockParam {
    if (part.type === 'text') {
        return {
            type: 'text',
            text: part.text,
        };
    }

    if (part.type === 'image') {
        if (part.source.type === 'url') {
            return {
                type: 'image',
                source: {
                    type: 'url',
                    url: part.source.url,
                },
            };
        }

        return {
            type: 'image',
            source: {
                type: 'base64',
                media_type: part.source.mediaType as
                    | 'image/jpeg'
                    | 'image/png'
                    | 'image/gif'
                    | 'image/webp',
                data: part.source.data,
            },
        };
    }

    if (part.type === 'audio') {
        throw new ValidationError('Anthropic does not support audio input');
    }

    if (part.mimeType !== 'application/pdf') {
        throw new Error(
            'Anthropic only supports PDF file content in this abstraction'
        );
    }

    return {
        type: 'document',
        source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: part.data,
        },
    };
}

/**
 * Strict tools get Anthropic's semantics-preserving normalization (the strict
 * grammar rejects `$schema`, open objects, numeric/length constraints, and
 * `oneOf`); non-strict tools are sent with their raw JSON Schema so declared
 * constraints reach the model as hints, matching the other providers.
 */
export function convertTools(tools: ToolSet): Tool[] {
    return Object.values(tools).map((tool) => {
        const strict = tool.strict === true;
        const schema = strict
            ? toAnthropicJsonSchema(tool.parameters)
            : zodSchemaToJsonSchema(tool.parameters);

        return {
            name: tool.name,
            description: tool.description,
            input_schema: schema as Tool['input_schema'],
            ...(strict ? { strict: true } : {}),
        };
    });
}

export function convertToolChoice(choice: AgToolChoice): ToolChoice {
    if (choice === 'auto') {
        return { type: 'auto' };
    }
    if (choice === 'none') {
        return { type: 'none' };
    }
    if (choice === 'required') {
        return { type: 'any' };
    }
    return {
        type: 'tool',
        name: choice.toolName,
    };
}

export function createStructuredOutputOptions<TSchema extends z.ZodType>(
    options: GenerateObjectOptions<TSchema>,
    provider = DEFAULT_PROVIDER_ID
): GenerateOptions {
    const schema = toAnthropicJsonSchema(options.schema);
    const schemaDescription = options.schemaDescription?.trim();
    if (schemaDescription && schemaDescription.length > 0) {
        schema.description = schemaDescription;
    }

    return {
        messages: options.messages,
        reasoning: options.reasoning,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        topP: options.topP,
        providerOptions: {
            ...(options.providerOptions ?? {}),
            [provider]: {
                ...(options.providerOptions?.[provider] ?? {}),
                outputConfig: {
                    format: {
                        type: 'json_schema',
                        schema,
                    },
                },
            },
        },
        signal: options.signal,
    };
}

function toAnthropicJsonSchema(schema: z.ZodType): Record<string, unknown> {
    return normalizeAnthropicJsonSchema(zodSchemaToJsonSchema(schema));
}

function normalizeAnthropicJsonSchema(value: unknown): Record<string, unknown> {
    const normalized = normalizeAnthropicJsonValue(value);
    return isJsonObject(normalized) ? normalized : {};
}

function normalizeAnthropicJsonValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(normalizeAnthropicJsonValue);
    }

    if (!isJsonObject(value)) {
        return value;
    }

    const normalized: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(value)) {
        if (
            key === '$schema' ||
            UNSUPPORTED_ANTHROPIC_SCHEMA_KEYWORDS.has(key) ||
            (key === 'minItems' && typeof child === 'number' && child > 1)
        ) {
            continue;
        }
        normalized[key] = normalizeAnthropicJsonValue(child);
    }

    // Zod emits `oneOf` only for z.discriminatedUnion(), whose branches are
    // disjoint by construction, so `anyOf` accepts the same values and is the
    // composition keyword Anthropic's schema subset supports.
    if (Array.isArray(normalized.oneOf) && normalized.anyOf === undefined) {
        normalized.anyOf = normalized.oneOf;
        delete normalized.oneOf;
    }

    if (isObjectSchema(normalized)) {
        normalized.additionalProperties = false;
    }

    return normalized;
}

function isObjectSchema(value: Record<string, unknown>): boolean {
    return (
        value.type === 'object' ||
        Object.hasOwn(value, 'properties') ||
        Object.hasOwn(value, 'required')
    );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Wrappers (e.g. `@core-ai/anthropic-vertex`) resolve capabilities once on the
 * chat model. When omitted, the adapter falls back to the Anthropic registry.
 */
export type AnthropicAdapterOptions = {
    capabilities?: ModelCapabilities;
};

/**
 * Fallback when neither the caller nor the model registry provides an output
 * limit. Anthropic requires `max_tokens` on every request.
 */
const FALLBACK_MAX_TOKENS = 4096;

/**
 * Builds a streaming Messages request. `generate()` streams too: the SDK
 * refuses non-streaming requests whose `max_tokens` could exceed ten minutes
 * of generation, which the model ceilings used for omitted limits always do.
 *
 * `defaultMaxTokens` is the provider-level default the user configured, if
 * any. It takes precedence over the model ceiling.
 */
export function createStreamRequest(
    modelId: string,
    defaultMaxTokens: number | undefined,
    options: GenerateOptions,
    provider = DEFAULT_PROVIDER_ID,
    adapterOptions: AnthropicAdapterOptions = {}
) {
    const anthropicOptions = parseAnthropicGenerateProviderOptions(
        options.providerOptions,
        provider
    );
    const capabilities =
        adapterOptions.capabilities ?? getAnthropicModelCapabilities(modelId);
    const maxTokens =
        options.maxTokens ??
        defaultMaxTokens ??
        capabilities.output?.maxTokens ??
        FALLBACK_MAX_TOKENS;
    const thinkingBudget = getManualThinkingBudget(
        modelId,
        options,
        capabilities
    );
    validateAnthropicReasoningConfig(
        modelId,
        maxTokens,
        thinkingBudget,
        options,
        anthropicOptions,
        provider,
        capabilities
    );
    validateMessages({
        messages: options.messages,
        capabilities,
        modelId,
        providerId: provider,
    });
    const converted = convertMessages(options.messages, provider);
    validateCacheBreakpoints({
        cacheTtls: converted.cacheTtls,
        requestCacheControl: anthropicOptions?.cacheControl,
        lastBlockCacheTtl: getLastBlockCacheTtl(converted.messages),
        providerId: provider,
    });
    if (options.tools) {
        validateToolSchemaStrictness({
            tools: options.tools,
            capabilities,
            providerId: provider,
            modelId,
        });
    }

    const baseRequest = {
        model: modelId,
        messages: converted.messages,
        max_tokens: maxTokens,
        ...(converted.system !== undefined ? { system: converted.system } : {}),
        ...(options.tools && Object.keys(options.tools).length > 0
            ? { tools: convertTools(options.tools) }
            : {}),
        ...(options.toolChoice
            ? { tool_choice: convertToolChoice(options.toolChoice) }
            : {}),
        ...mapReasoningToRequestFields(
            modelId,
            thinkingBudget,
            options,
            capabilities
        ),
        ...mapSamplingToRequestFields(options),
        stream: true as const,
    };
    return mapAnthropicProviderOptionsToRequest(baseRequest, anthropicOptions);
}

function getManualThinkingBudget(
    modelId: string,
    options: GenerateOptions,
    capabilities: ModelCapabilities
): number | undefined {
    if (!options.reasoning || getAnthropicThinkingMode(modelId) !== 'manual') {
        return undefined;
    }
    return toAnthropicManualBudget(
        clampReasoningEffort(
            options.reasoning.effort,
            capabilities.reasoning.supportedEfforts
        ),
        capabilities.output?.maxTokens
    );
}

function getRequestedToolChoiceMode(toolChoice: GenerateOptions['toolChoice']) {
    if (toolChoice === undefined) {
        return undefined;
    }

    return typeof toolChoice === 'object' ? toolChoice.type : toolChoice;
}

function mapSamplingToRequestFields(
    options: Pick<GenerateOptions, 'temperature' | 'topP'>
) {
    return {
        ...(options.temperature !== undefined
            ? { temperature: options.temperature }
            : {}),
        ...(options.topP !== undefined ? { top_p: options.topP } : {}),
    };
}

function validateAnthropicReasoningConfig(
    modelId: string,
    maxTokens: number,
    thinkingBudget: number | undefined,
    options: GenerateOptions,
    anthropicOptions: AnthropicGenerateProviderOptions | undefined,
    provider: string,
    capabilities: ModelCapabilities
): void {
    const alwaysRestrictsSampling =
        restrictsAnthropicSamplingParamsAlways(modelId);
    if (
        alwaysRestrictsSampling &&
        options.temperature !== undefined &&
        options.temperature !== 1
    ) {
        throw new ValidationError(
            `Anthropic model "${modelId}" only supports the default temperature of 1`,
            undefined,
            provider
        );
    }
    const defaultTopP = getAnthropicDefaultTopP(modelId);
    if (
        alwaysRestrictsSampling &&
        options.topP !== undefined &&
        options.topP !== defaultTopP
    ) {
        throw new ValidationError(
            `Anthropic model "${modelId}" only supports the default topP of ${defaultTopP}`,
            undefined,
            provider
        );
    }
    if (
        rejectsAnthropicCombinedSamplingParams(modelId) &&
        options.temperature !== undefined &&
        options.topP !== undefined
    ) {
        throw new ValidationError(
            `Anthropic model "${modelId}" does not support setting temperature and topP together`,
            undefined,
            provider
        );
    }
    if (alwaysRestrictsSampling && anthropicOptions?.topK !== undefined) {
        throw new ValidationError(
            `Anthropic model "${modelId}" does not support top_k`,
            undefined,
            provider
        );
    }

    const toolChoiceMode = getRequestedToolChoiceMode(options.toolChoice);
    if (
        rejectsAnthropicForcedToolChoiceAlways(modelId) &&
        toolChoiceMode !== undefined &&
        !capabilities.reasoning.supportedToolChoices.includes(toolChoiceMode)
    ) {
        throw new ValidationError(
            `Anthropic model "${modelId}" does not support toolChoice "${toolChoiceMode}"`,
            undefined,
            provider
        );
    }

    const reasoningActive =
        options.reasoning !== undefined ||
        capabilities.reasoning.mode === 'always-on';
    if (!reasoningActive) {
        return;
    }

    // Shrinking the budget to fit would silently change the response, so a
    // limit that cannot hold it is rejected instead.
    if (thinkingBudget !== undefined && maxTokens <= thinkingBudget) {
        throw new ValidationError(
            `Anthropic model "${modelId}" needs maxTokens above the ${thinkingBudget}-token thinking budget of reasoning effort "${options.reasoning?.effort}", but maxTokens is ${maxTokens}. Raise maxTokens, lower the effort, or omit maxTokens to use the model's output limit.`,
            undefined,
            provider
        );
    }

    if (
        options.temperature !== undefined &&
        (!alwaysRestrictsSampling || options.temperature !== 1)
    ) {
        throw new ValidationError(
            `Anthropic model "${modelId}" does not support temperature when reasoning is enabled`,
            undefined,
            provider
        );
    }

    if (
        options.topP !== undefined &&
        (options.topP < 0.95 || options.topP > 1)
    ) {
        throw new ValidationError(
            `Anthropic model "${modelId}" requires topP between 0.95 and 1 when reasoning is enabled`,
            undefined,
            provider
        );
    }

    if (
        toolChoiceMode !== undefined &&
        !capabilities.reasoning.supportedToolChoices.includes(toolChoiceMode)
    ) {
        throw new ValidationError(
            `Anthropic model "${modelId}" does not support toolChoice "${toolChoiceMode}" when reasoning is enabled`,
            undefined,
            provider
        );
    }

    if (anthropicOptions?.topK !== undefined) {
        throw new ValidationError(
            `Anthropic model "${modelId}" does not support top_k when reasoning is enabled`,
            undefined,
            provider
        );
    }
}

function mapReasoningToRequestFields(
    modelId: string,
    thinkingBudget: number | undefined,
    options: GenerateOptions,
    capabilities: ModelCapabilities
) {
    if (!options.reasoning) {
        return {};
    }

    if (thinkingBudget !== undefined) {
        return {
            thinking: {
                type: 'enabled',
                budget_tokens: thinkingBudget,
                display: 'summarized',
            },
        };
    }

    const effort = clampReasoningEffort(
        options.reasoning.effort,
        capabilities.reasoning.supportedEfforts
    );
    return {
        thinking: {
            type: 'adaptive',
            display: 'summarized',
        },
        output_config: {
            effort: toAnthropicAdaptiveEffort(
                effort,
                supportsAnthropicMaxEffort(modelId)
            ),
        },
    };
}

export function getAnthropicRequestBetas(
    modelId: string,
    options: GenerateOptions,
    provider = DEFAULT_PROVIDER_ID
): string[] {
    const providerOptions = parseAnthropicGenerateProviderOptions(
        options.providerOptions,
        provider
    );
    const configuredBetas = providerOptions?.betas ?? [];
    const shouldEnableInterleavedThinking =
        options.reasoning !== undefined &&
        options.tools !== undefined &&
        Object.keys(options.tools).length > 0 &&
        requiresAnthropicInterleavedThinkingBeta(modelId);

    return uniqueStrings([
        ...configuredBetas,
        ...(shouldEnableInterleavedThinking
            ? ['interleaved-thinking-2025-05-14']
            : []),
    ]);
}

function mapAnthropicProviderOptionsToRequest<TRequest extends object>(
    baseRequest: TRequest,
    providerOptions: AnthropicGenerateProviderOptions | undefined
): TRequest {
    if (!providerOptions) {
        return baseRequest;
    }

    const baseOutputConfig = asObject(
        (baseRequest as { output_config?: unknown }).output_config
    );
    const mergedOutputConfig = {
        ...baseOutputConfig,
        ...(providerOptions.outputConfig ?? {}),
    };

    const mergedRequest = {
        ...baseRequest,
        ...(providerOptions.cacheControl
            ? { cache_control: providerOptions.cacheControl }
            : {}),
        ...(providerOptions.topK !== undefined
            ? { top_k: providerOptions.topK }
            : {}),
        ...(providerOptions.stopSequences
            ? { stop_sequences: providerOptions.stopSequences }
            : {}),
        ...(Object.keys(mergedOutputConfig).length > 0
            ? { output_config: mergedOutputConfig }
            : {}),
    };
    return mergedRequest as TRequest;
}

export async function* transformStream(
    stream: AsyncIterable<RawMessageStreamEvent>
): AsyncIterable<StreamEvent> {
    let finishReason: FinishReason = 'unknown';
    let usage = {
        inputTokens: 0,
        outputTokens: 0,
        inputTokenDetails: {
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
        },
        outputTokenDetails: {},
    };

    const toolBuffers = new Map<
        number,
        { id: string; name: string; arguments: string }
    >();
    const emittedToolCalls = new Set<number>();
    const contentBlockTypeByIndex = new Map<number, string>();
    const reasoningSignatureByIndex = new Map<number, string>();

    for await (const event of stream) {
        if (event.type === 'message_start') {
            const cacheReadTokens =
                event.message.usage.cache_read_input_tokens ?? 0;
            const cacheWriteTokens =
                event.message.usage.cache_creation_input_tokens ?? 0;
            const inputTokens =
                event.message.usage.input_tokens +
                cacheReadTokens +
                cacheWriteTokens;
            usage = {
                inputTokens,
                outputTokens: event.message.usage.output_tokens,
                inputTokenDetails: {
                    cacheReadTokens,
                    cacheWriteTokens,
                },
                outputTokenDetails: mapAnthropicOutputTokenDetails(
                    event.message.usage
                ),
            };
            continue;
        }

        if (event.type === 'content_block_start') {
            contentBlockTypeByIndex.set(event.index, event.content_block.type);
            if (event.content_block.type === 'thinking') {
                yield {
                    type: 'reasoning-start',
                };
                continue;
            }
            if (event.content_block.type === 'redacted_thinking') {
                // Redacted blocks arrive whole; the opaque data must survive
                // so the block can be sent back on the next turn.
                const redactedData = event.content_block.data;
                yield { type: 'reasoning-start' };
                yield {
                    type: 'reasoning-end',
                    providerMetadata: {
                        anthropic: {
                            ...(redactedData ? { redactedData } : {}),
                        },
                    },
                };
                continue;
            }
            if (event.content_block.type === 'text') {
                yield {
                    type: 'text-start',
                };
                continue;
            }
            if (event.content_block.type === 'tool_use') {
                const block = event.content_block as ToolUseBlock;
                const initialArguments =
                    block.input && typeof block.input === 'object'
                        ? Object.keys(block.input).length > 0
                            ? JSON.stringify(block.input)
                            : ''
                        : '';

                toolBuffers.set(event.index, {
                    id: block.id,
                    name: block.name,
                    arguments: initialArguments,
                });

                yield {
                    type: 'tool-call-start',
                    toolCallId: block.id,
                    toolName: block.name,
                };
            }
            continue;
        }

        if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
                yield {
                    type: 'text-delta',
                    text: event.delta.text,
                };
                continue;
            }

            if (event.delta.type === 'thinking_delta') {
                const thinkingDelta = event.delta as {
                    thinking?: unknown;
                    text?: unknown;
                };
                const thinkingText =
                    typeof thinkingDelta.thinking === 'string'
                        ? thinkingDelta.thinking
                        : typeof thinkingDelta.text === 'string'
                          ? thinkingDelta.text
                          : '';
                if (thinkingText.length > 0) {
                    yield {
                        type: 'reasoning-delta',
                        text: thinkingText,
                    };
                }
                continue;
            }

            if (event.delta.type === 'signature_delta') {
                reasoningSignatureByIndex.set(
                    event.index,
                    event.delta.signature
                );
                continue;
            }

            if (event.delta.type === 'input_json_delta') {
                const current = toolBuffers.get(event.index);
                if (!current) {
                    continue;
                }

                current.arguments += event.delta.partial_json;
                yield {
                    type: 'tool-call-delta',
                    toolCallId: current.id,
                    argumentsDelta: event.delta.partial_json,
                };
            }
            continue;
        }

        if (event.type === 'content_block_stop') {
            if (contentBlockTypeByIndex.get(event.index) === 'text') {
                contentBlockTypeByIndex.delete(event.index);
                yield {
                    type: 'text-end',
                };
                continue;
            }

            if (contentBlockTypeByIndex.get(event.index) === 'thinking') {
                const signature = reasoningSignatureByIndex.get(event.index);
                reasoningSignatureByIndex.delete(event.index);
                contentBlockTypeByIndex.delete(event.index);
                // 'anthropic' below is the shared reasoning-metadata
                // namespace key, not a provider id.
                yield {
                    type: 'reasoning-end',
                    providerMetadata: {
                        anthropic: { ...(signature ? { signature } : {}) },
                    },
                };
                continue;
            }

            contentBlockTypeByIndex.delete(event.index);
            const current = toolBuffers.get(event.index);
            if (!current || emittedToolCalls.has(event.index)) {
                continue;
            }

            emittedToolCalls.add(event.index);
            yield {
                type: 'tool-call-end',
                toolCall: {
                    id: current.id,
                    name: current.name,
                    arguments: safeParseJsonObject(current.arguments),
                },
            };
            continue;
        }

        if (event.type === 'message_delta') {
            finishReason = mapStopReason(event.delta.stop_reason);
            const nonCachedInputTokens =
                event.usage.input_tokens ??
                usage.inputTokens -
                    usage.inputTokenDetails.cacheReadTokens -
                    usage.inputTokenDetails.cacheWriteTokens;
            const cacheReadTokens =
                event.usage.cache_read_input_tokens ??
                usage.inputTokenDetails.cacheReadTokens;
            const cacheWriteTokens =
                event.usage.cache_creation_input_tokens ??
                usage.inputTokenDetails.cacheWriteTokens;
            usage = {
                inputTokens:
                    nonCachedInputTokens + cacheReadTokens + cacheWriteTokens,
                outputTokens: event.usage.output_tokens,
                inputTokenDetails: {
                    cacheReadTokens,
                    cacheWriteTokens,
                },
                outputTokenDetails: {
                    ...usage.outputTokenDetails,
                    ...mapAnthropicOutputTokenDetails(event.usage),
                },
            };
            continue;
        }
    }

    yield {
        type: 'finish',
        finishReason,
        usage,
    };
}

function mapStopReason(reason: StopReason | null): FinishReason {
    if (reason === 'end_turn' || reason === 'stop_sequence') {
        return 'stop';
    }
    if (reason === 'max_tokens' || reason === 'model_context_window_exceeded') {
        return 'length';
    }
    if (reason === 'tool_use') {
        return 'tool-calls';
    }
    if (reason === 'refusal') {
        return 'content-filter';
    }
    return 'unknown';
}

function mapAnthropicOutputTokenDetails(usage: unknown): {
    reasoningTokens?: number;
} {
    const outputTokenDetails = asObject(asObject(usage).output_tokens_details);
    const reasoningTokens = outputTokenDetails.thinking_tokens;
    return typeof reasoningTokens === 'number' ? { reasoningTokens } : {};
}

function uniqueStrings(values: string[]): string[] {
    return [...new Set(values)];
}
