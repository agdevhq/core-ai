import type {
    RawMessageStreamEvent,
    StopReason,
    ToolUseBlock,
    ContentBlockParam,
    DocumentBlockParam,
    ImageBlockParam,
    MessageParam,
    Tool,
    ToolChoice,
    TextBlockParam,
    ToolReferenceBlockParam,
    ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages/messages';
import {
    asObject,
    clampReasoningEffort,
    getEmulatedToolSet,
    getProviderMetadata,
    getStructuredOutputMessages,
    getToolDiscoveryArguments,
    getToolDiscoveryResultText,
    getToolJsonSchema,
    mapChildSchemaNodes,
    normalizeStrictJsonSchema,
    normalizeStructuredOutputSchema,
    requireEveryKey,
    resolveToolDiscovery,
    TOOL_DISCOVERY_PLACEHOLDER_TOOL_NAME,
    TOOL_DISCOVERY_TOOL_NAME,
    toToolDiscoveryToolResult,
    ValidationError,
    safeParseJsonObject,
    validateMessages,
    validateToolSchemaStrictness,
} from '@core-ai/core-ai';

export { wrapAnthropicError } from './anthropic-error.ts';
import type {
    FinishReason,
    GenerateObjectOptions,
    GenerateOptions,
    JsonSchema,
    Message,
    ModelCapabilities,
    ResolvedToolDiscovery,
    SchemaInput,
    StreamEvent,
    SystemMessage,
    ToolDefinition,
    ToolDiscoveryResultMessage,
    ToolResultMessage,
    ToolSet,
    UserContentPart,
    UserMessage,
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
    parseAnthropicMessageProviderOptions,
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
 *
 * Discovery calls are `tool_use` blocks for the discovery tool. With
 * `toolDiscovery: 'native'`, discovery results reference the discovered
 * tools with `tool_reference` blocks; otherwise they are text tool results.
 */
export function convertMessages(
    messages: Message[],
    provider = DEFAULT_PROVIDER_ID,
    toolDiscovery: ResolvedToolDiscovery['rendering'] = 'emulated'
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
                cacheTtls.push(getCacheTtl(block.cache_control));
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
            const content = convertUserMessage(message, provider);
            const lastBlockCacheTtl = getLastBlockCacheTtl(content);
            if (lastBlockCacheTtl) {
                cacheTtls.push(lastBlockCacheTtl);
            }
            convertedMessages.push({ role: 'user', content });
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

                if (part.type === 'tool-discovery-call') {
                    contentBlocks.push({
                        type: 'tool_use',
                        id: part.discoveryCall.id,
                        name: TOOL_DISCOVERY_TOOL_NAME,
                        input: getToolDiscoveryArguments(part.discoveryCall),
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

        let toolResultBlock: ToolResultBlockParam;
        if (message.role === 'tool') {
            toolResultBlock = convertToolResultMessage(message, provider);
        } else if (toolDiscovery === 'native') {
            toolResultBlock = convertToolDiscoveryResult(message, provider);
        } else {
            toolResultBlock = convertToolResultMessage(
                toToolDiscoveryToolResult(message),
                provider
            );
        }
        if (toolResultBlock.cache_control) {
            cacheTtls.push(getCacheTtl(toolResultBlock.cache_control));
        }

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
        ? getCacheTtl(requestCacheControl)
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
            'Anthropic cache breakpoints must not increase in TTL: a 1h breakpoint cannot follow a 5m one. Message breakpoints apply in message order, request-level cacheControl last.',
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
            `Request-level cacheControl (ttl ${requestTtl}) targets the last message, whose own cacheControl has ttl ${lastBlockCacheTtl}; Anthropic requires matching TTLs.`,
            undefined,
            providerId
        );
    }
}

function getLastBlockCacheTtl(
    content: MessageParam['content'] | undefined
): AnthropicCacheTtl | undefined {
    if (!Array.isArray(content)) {
        return undefined;
    }

    const lastBlock = content.at(-1);
    if (!lastBlock || !('cache_control' in lastBlock)) {
        return undefined;
    }

    return lastBlock.cache_control
        ? getCacheTtl(lastBlock.cache_control)
        : undefined;
}

function getCacheTtl(cacheControl: AnthropicCacheControl): AnthropicCacheTtl {
    return cacheControl.ttl ?? '5m';
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
    const cacheControl = parseAnthropicMessageProviderOptions(
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

/**
 * A user message with `cacheControl` is sent as blocks, with the breakpoint
 * on its last block. Anthropic rejects `cache_control` on an empty text
 * block, so a message without a non-empty last block is rejected here
 * instead of having its breakpoint silently dropped.
 */
function convertUserMessage(
    message: UserMessage,
    provider: string
): MessageParam['content'] {
    const cacheControl = parseAnthropicMessageProviderOptions(
        message.providerOptions,
        provider
    )?.cacheControl;

    if (!cacheControl) {
        return typeof message.content === 'string'
            ? message.content
            : message.content.map(convertUserContentPart);
    }

    const blocks =
        typeof message.content === 'string'
            ? [{ type: 'text' as const, text: message.content }]
            : message.content.map(convertUserContentPart);
    const lastBlock = blocks.at(-1);
    if (!lastBlock || (lastBlock.type === 'text' && lastBlock.text === '')) {
        throw new ValidationError(
            'A user message with cacheControl must end with a non-empty content part; Anthropic cannot place a cache breakpoint on an empty text block.',
            undefined,
            provider
        );
    }

    return [
        ...blocks.slice(0, -1),
        { ...lastBlock, cache_control: cacheControl },
    ];
}

function convertToolResultMessage(
    message: ToolResultMessage,
    provider: string
): ToolResultBlockParam {
    const cacheControl = parseAnthropicMessageProviderOptions(
        message.providerOptions,
        provider
    )?.cacheControl;

    return {
        type: 'tool_result',
        tool_use_id: message.toolCallId,
        content: message.content,
        ...(message.isError ? { is_error: true } : {}),
        ...(cacheControl ? { cache_control: cacheControl } : {}),
    };
}

/**
 * References load the discovered tools, which the request declares as
 * deferred tools; a result with references cannot also hold text. An empty
 * result has nothing to reference, so it is text: its note, or that nothing
 * was found.
 */
function convertToolDiscoveryResult(
    message: ToolDiscoveryResultMessage,
    provider: string
): ToolResultBlockParam {
    const cacheControl = parseAnthropicMessageProviderOptions(
        message.providerOptions,
        provider
    )?.cacheControl;

    return {
        type: 'tool_result',
        tool_use_id: message.discoveryCallId,
        content:
            message.tools.length > 0
                ? message.tools.map(
                      (tool): ToolReferenceBlockParam => ({
                          type: 'tool_reference',
                          tool_name: tool.name,
                      })
                  )
                : getToolDiscoveryResultText(message),
        ...(cacheControl ? { cache_control: cacheControl } : {}),
    };
}

function convertUserContentPart(
    part: UserContentPart
): TextBlockParam | ImageBlockParam | DocumentBlockParam {
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
    return Object.values(tools).map((tool) => convertTool(tool));
}

function convertTool(tool: ToolDefinition, deferLoading = false): Tool {
    const strict = tool.strict === true;
    const jsonSchema = getToolJsonSchema(tool);
    const schema = strict
        ? normalizeAnthropicJsonSchema(jsonSchema)
        : jsonSchema;

    return {
        name: tool.name,
        description: tool.description,
        input_schema: schema as Tool['input_schema'],
        ...(strict ? { strict: true } : {}),
        ...(deferLoading ? { defer_loading: true } : {}),
    };
}

/**
 * Declaring the first deferred tool changes the rendered prompt prefix
 * (observed: about 93 tokens) and so rewrites the whole prompt cache. This
 * never-referenced deferred tool keeps that mode active from the first
 * native request on, so later discoveries keep the cache.
 */
const DEFERRAL_PLACEHOLDER_TOOL: Tool = {
    name: TOOL_DISCOVERY_PLACEHOLDER_TOOL_NAME,
    description: 'Placeholder that is never loaded. Do not call it.',
    input_schema: { type: 'object', properties: {} },
    defer_loading: true,
};

/**
 * The request's tools. Natively, the caller's tools and the discovery tool
 * come first, then the deferral placeholder and the discovered tools, which
 * are deferred and loaded by the `tool_reference` blocks of discovery
 * results. Emulated, every tool is an ordinary tool.
 */
function convertRequestTools(
    tools: ToolSet | undefined,
    toolDiscovery: ResolvedToolDiscovery
): Tool[] {
    if (toolDiscovery.rendering === 'emulated') {
        return convertTools(getEmulatedToolSet(tools, toolDiscovery) ?? {});
    }

    return [
        ...convertTools(tools ?? {}),
        convertTool(toolDiscovery.discoveryTool),
        DEFERRAL_PLACEHOLDER_TOOL,
        ...toolDiscovery.discoveredTools.map((tool) => convertTool(tool, true)),
    ];
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

export function createStructuredOutputOptions<TSchema extends SchemaInput>(
    options: GenerateObjectOptions<TSchema>,
    provider = DEFAULT_PROVIDER_ID
): GenerateOptions {
    const schema = normalizeAnthropicJsonSchema(
        normalizeStructuredOutputSchema(options).jsonSchema
    );
    const schemaDescription = options.schemaDescription?.trim();
    if (schemaDescription && schemaDescription.length > 0) {
        schema.description = schemaDescription;
    }

    return {
        messages: getStructuredOutputMessages(options.messages, provider),
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

/**
 * The strict normalization OpenAI-style APIs get, minus the numeric and length
 * constraints Anthropic's grammar also rejects. The schema's validator still
 * enforces them. Nullable and defaulted keys are required, because Anthropic
 * allows at most 24 optional parameters per request.
 */
function normalizeAnthropicJsonSchema(schema: JsonSchema): JsonSchema {
    return requireEveryKey(
        stripUnsupportedAnthropicKeywords(normalizeStrictJsonSchema(schema))
    ).schema;
}

function stripUnsupportedAnthropicKeywords(node: JsonSchema): JsonSchema {
    const result = mapChildSchemaNodes(node, stripUnsupportedAnthropicKeywords);
    for (const keyword of UNSUPPORTED_ANTHROPIC_SCHEMA_KEYWORDS) {
        delete result[keyword];
    }
    if (typeof result.minItems === 'number' && result.minItems > 1) {
        delete result.minItems;
    }
    return result;
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
    const toolDiscovery = resolveToolDiscovery(options, {
        capabilities,
        providerId: provider,
        modelId,
        emulate: anthropicOptions?.emulateToolDiscovery,
    });
    const converted = convertMessages(
        options.messages,
        provider,
        toolDiscovery.rendering
    );
    validateCacheBreakpoints({
        cacheTtls: converted.cacheTtls,
        requestCacheControl: anthropicOptions?.cacheControl,
        lastBlockCacheTtl: getLastBlockCacheTtl(
            converted.messages.at(-1)?.content
        ),
        providerId: provider,
    });
    const declaredTools = getEmulatedToolSet(options.tools, toolDiscovery);
    if (declaredTools) {
        validateToolSchemaStrictness({
            tools: declaredTools,
            capabilities,
            providerId: provider,
            modelId,
        });
    }
    const tools = convertRequestTools(options.tools, toolDiscovery);

    // Key order is load-bearing. Vertex AI multi-region and global endpoints
    // were observed (not documented) to route cache lookups by the leading
    // bytes of the JSON body, so the body follows Anthropic's cache prefix
    // order (`tools`, `system`, the growing `messages`) and puts per-request
    // settings after it, where a changed setting cannot alter that prefix.
    // Anthropic's API itself is order-insensitive.
    const settings = mapAnthropicProviderOptionsToRequest(
        {
            ...(options.toolChoice
                ? { tool_choice: convertToolChoice(options.toolChoice) }
                : {}),
            max_tokens: maxTokens,
            ...mapReasoningToRequestFields(
                modelId,
                thinkingBudget,
                options,
                capabilities
            ),
            ...mapSamplingToRequestFields(options),
        },
        anthropicOptions
    );
    return {
        model: modelId,
        ...(tools.length > 0 ? { tools } : {}),
        ...(converted.system !== undefined ? { system: converted.system } : {}),
        messages: converted.messages,
        ...settings,
        stream: true as const,
    };
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
    const declaresTools =
        Object.keys(options.tools ?? {}).length > 0 ||
        options.toolDiscovery !== undefined ||
        options.messages.some((message) => message.role === 'tool-discovery');
    const shouldEnableInterleavedThinking =
        options.reasoning !== undefined &&
        declaresTools &&
        requiresAnthropicInterleavedThinkingBeta(modelId);

    return uniqueStrings([
        ...configuredBetas,
        ...(shouldEnableInterleavedThinking
            ? ['interleaved-thinking-2025-05-14']
            : []),
    ]);
}

function mapAnthropicProviderOptionsToRequest<TRequest extends object>(
    settings: TRequest,
    providerOptions: AnthropicGenerateProviderOptions | undefined
): TRequest {
    if (!providerOptions) {
        return settings;
    }

    const baseOutputConfig = asObject(
        (settings as { output_config?: unknown }).output_config
    );
    const mergedOutputConfig = {
        ...baseOutputConfig,
        ...(providerOptions.outputConfig ?? {}),
    };

    const mergedRequest = {
        ...settings,
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

    // Claude can end a turn that calls tools with `end_turn` instead of
    // `tool_use`. A stream that completed tool calls and stops finishes with
    // `'tool-calls'`; truncated or filtered calls keep their reason.
    if (finishReason === 'stop' && emittedToolCalls.size > 0) {
        finishReason = 'tool-calls';
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
