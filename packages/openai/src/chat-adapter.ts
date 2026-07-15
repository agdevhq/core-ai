import type {
    Response,
    ResponseCreateParamsNonStreaming,
    ResponseCreateParamsStreaming,
    ResponseFunctionToolCall,
    ResponseInputItem,
    ResponseOutputItem,
    ResponseOutputMessage,
    ResponseReasoningItem,
    ResponseStreamEvent,
    ResponseUsage,
} from 'openai/resources/responses/responses';
import type {
    AssistantContentPart,
    FinishReason,
    GenerateOptions,
    GenerateResult,
    Message,
    StreamEvent,
    ToolCall,
    ToolSet,
    UserContentPart,
} from '@core-ai/core-ai';
import { getProviderMetadata, clampReasoningEffort } from '@core-ai/core-ai';
import {
    getOpenAIModelCapabilities,
    toOpenAIReasoningEffort,
} from './model-capabilities.js';
import { convertToolChoice, convertTools } from './shared/tools.js';
import type { OpenAIRequestOptions } from './shared/structured-output.js';
import {
    safeParseJsonObject,
    validateOpenAIReasoningConfig,
} from './shared/utils.js';
import {
    parseOpenAIResponsesGenerateProviderOptions,
    type OpenAIResponsesGenerateProviderOptions,
} from './provider-options.js';

export { validateOpenAIReasoningConfig };

export type OpenAIReasoningMetadata = {
    encryptedContent?: string;
};

type ConvertMessagesOptions = {
    includeReasoning?: boolean;
};

const ENCRYPTED_REASONING_INCLUDE = 'reasoning.encrypted_content';
const REASONING_SUMMARY_SEPARATOR = '\n\n';

export function convertMessages(
    messages: Message[],
    options: ConvertMessagesOptions = {}
): ResponseInputItem[] {
    const includeReasoning = options.includeReasoning ?? true;
    return messages.flatMap((message) =>
        convertMessage(message, includeReasoning)
    );
}

function convertMessage(
    message: Message,
    includeReasoning: boolean
): ResponseInputItem[] {
    if (message.role === 'system') {
        return [
            {
                role: 'developer',
                content: message.content,
            } as ResponseInputItem,
        ];
    }

    if (message.role === 'user') {
        return [
            {
                role: 'user',
                content:
                    typeof message.content === 'string'
                        ? message.content
                        : message.content.map(convertUserContentPart),
            } as ResponseInputItem,
        ];
    }

    if (message.role === 'assistant') {
        return convertAssistantMessage(message.parts, includeReasoning);
    }

    return [
        {
            type: 'function_call_output',
            call_id: message.toolCallId,
            output: message.content,
        } as ResponseInputItem,
    ];
}

function convertAssistantMessage(
    parts: AssistantContentPart[],
    includeReasoning: boolean
): ResponseInputItem[] {
    const items: ResponseInputItem[] = [];
    const textParts: string[] = [];

    const flushTextBuffer = () => {
        if (textParts.length === 0) {
            return;
        }

        items.push({
            role: 'assistant',
            content: textParts.join('\n\n'),
        } as ResponseInputItem);
        textParts.length = 0;
    };

    for (const part of parts) {
        if (part.type === 'text') {
            textParts.push(part.text);
            continue;
        }

        if (part.type === 'reasoning') {
            if (
                !includeReasoning ||
                getProviderMetadata<OpenAIReasoningMetadata>(
                    part.providerMetadata,
                    'openai'
                ) == null
            ) {
                if (part.text.length > 0) {
                    textParts.push(`<thinking>${part.text}</thinking>`);
                }
                continue;
            }

            flushTextBuffer();
            const encryptedContent = getEncryptedReasoningContent(part);
            items.push({
                type: 'reasoning',
                summary: [
                    {
                        type: 'summary_text',
                        text: part.text,
                    },
                ],
                ...(encryptedContent
                    ? { encrypted_content: encryptedContent }
                    : {}),
            } as ResponseInputItem);
            continue;
        }

        flushTextBuffer();
        items.push({
            type: 'function_call',
            call_id: part.toolCall.id,
            name: part.toolCall.name,
            arguments: JSON.stringify(part.toolCall.arguments),
        } as ResponseInputItem);
    }

    flushTextBuffer();

    return items;
}

function getEncryptedReasoningContent(
    part: Extract<AssistantContentPart, { type: 'reasoning' }>
): string | undefined {
    const { encryptedContent } =
        getProviderMetadata<OpenAIReasoningMetadata>(
            part.providerMetadata,
            'openai'
        ) ?? {};
    return typeof encryptedContent === 'string' && encryptedContent.length > 0
        ? encryptedContent
        : undefined;
}

function convertUserContentPart(part: UserContentPart) {
    if (part.type === 'text') {
        return {
            type: 'input_text' as const,
            text: part.text,
        };
    }

    if (part.type === 'image') {
        const imageUrl =
            part.source.type === 'url'
                ? part.source.url
                : `data:${part.source.mediaType};base64,${part.source.data}`;

        return {
            type: 'input_image' as const,
            image_url: imageUrl,
        };
    }

    return {
        type: 'input_file' as const,
        file_data: part.data,
        ...(part.filename ? { filename: part.filename } : {}),
    };
}

export function createGenerateRequest(
    modelId: string,
    options: GenerateOptions
): ResponseCreateParamsNonStreaming {
    return createRequest(
        modelId,
        options,
        false
    ) as unknown as ResponseCreateParamsNonStreaming;
}

export function createStreamRequest(
    modelId: string,
    options: GenerateOptions
): ResponseCreateParamsStreaming {
    return createRequest(
        modelId,
        options,
        true
    ) as unknown as ResponseCreateParamsStreaming;
}

function createRequest(
    modelId: string,
    options: OpenAIRequestOptions,
    stream: boolean
) {
    const openaiOptions = parseOpenAIResponsesGenerateProviderOptions(
        options.providerOptions
    );
    const request: Record<string, unknown> = {
        ...createRequestBase(modelId, options),
        ...(stream ? { stream: true as const } : {}),
        ...(options.structuredOutputFormat
            ? { text: { format: options.structuredOutputFormat } }
            : {}),
        ...mapOpenAIProviderOptionsToRequestFields(openaiOptions),
    };

    if (
        options.reasoning &&
        getOpenAIModelCapabilities(modelId).reasoning.supported
    ) {
        request.include = mergeInclude(request.include, [
            ENCRYPTED_REASONING_INCLUDE,
        ]);
    }

    return request;
}

function createRequestBase(modelId: string, options: GenerateOptions) {
    validateOpenAIReasoningConfig(modelId, options);
    const capabilities = getOpenAIModelCapabilities(modelId);

    return {
        model: modelId,
        store: false as const,
        input: convertMessages(options.messages, {
            includeReasoning: capabilities.reasoning.supported,
        }),
        ...(options.tools && Object.keys(options.tools).length > 0
            ? { tools: convertResponseTools(options.tools) }
            : {}),
        ...(options.toolChoice
            ? { tool_choice: convertResponseToolChoice(options.toolChoice) }
            : {}),
        ...mapReasoningToRequestFields(modelId, options),
        ...mapSamplingToRequestFields(options),
    };
}

function convertResponseTools(tools: ToolSet) {
    return convertTools(tools).map((tool) => ({
        type: 'function' as const,
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
    }));
}

function convertResponseToolChoice(
    choice: NonNullable<GenerateOptions['toolChoice']>
) {
    const converted = convertToolChoice(choice);

    if (typeof converted === 'string') {
        return converted;
    }

    return {
        type: 'function' as const,
        name: converted.function.name,
    };
}

function mergeInclude(
    value: unknown,
    requiredIncludes: string[]
): string[] | undefined {
    const include = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];

    for (const requiredInclude of requiredIncludes) {
        if (!include.includes(requiredInclude)) {
            include.push(requiredInclude);
        }
    }

    return include.length > 0 ? include : undefined;
}

function mapSamplingToRequestFields(
    options: Pick<GenerateOptions, 'temperature' | 'maxTokens' | 'topP'>
) {
    return {
        ...(options.temperature !== undefined
            ? { temperature: options.temperature }
            : {}),
        ...(options.maxTokens !== undefined
            ? { max_output_tokens: options.maxTokens }
            : {}),
        ...(options.topP !== undefined ? { top_p: options.topP } : {}),
    };
}

function mapOpenAIProviderOptionsToRequestFields(
    options: OpenAIResponsesGenerateProviderOptions | undefined
) {
    return {
        ...(options?.store !== undefined ? { store: options.store } : {}),
        ...(options?.serviceTier !== undefined
            ? { service_tier: options.serviceTier }
            : {}),
        ...(options?.include ? { include: options.include } : {}),
        ...(options?.parallelToolCalls !== undefined
            ? { parallel_tool_calls: options.parallelToolCalls }
            : {}),
        ...(options?.user !== undefined ? { user: options.user } : {}),
    };
}

export function mapGenerateResponse(response: Response): GenerateResult {
    const parts: AssistantContentPart[] = [];

    for (const item of response.output) {
        if (isReasoningItem(item)) {
            const reasoningPart = mapReasoningPart(item);
            if (reasoningPart) {
                parts.push(reasoningPart);
            }
            continue;
        }

        if (isOutputMessage(item)) {
            parts.push(...mapMessageTextParts(item));
            continue;
        }

        if (isFunctionToolCall(item)) {
            parts.push({
                type: 'tool-call',
                toolCall: {
                    id: item.call_id,
                    name: item.name,
                    arguments: safeParseJsonObject(item.arguments),
                },
            });
        }
    }

    const content = getTextContent(parts);
    const reasoning = getReasoningText(parts);
    const toolCalls = getToolCalls(parts);

    return {
        parts,
        content,
        reasoning,
        toolCalls,
        finishReason: mapFinishReason(response, toolCalls.length > 0),
        usage: mapUsage(response.usage),
    };
}

function mapReasoningPart(
    item: ResponseReasoningItem
): Extract<AssistantContentPart, { type: 'reasoning' }> | null {
    const text = getReasoningSummaryText(item.summary);
    const encryptedContent =
        typeof item.encrypted_content === 'string' &&
        item.encrypted_content.length > 0
            ? item.encrypted_content
            : undefined;

    if (text.length === 0 && !encryptedContent) {
        return null;
    }

    return {
        type: 'reasoning',
        text,
        providerMetadata: {
            openai: { ...(encryptedContent ? { encryptedContent } : {}) },
        },
    };
}

function getReasoningSummaryText(
    summary: ResponseReasoningItem['summary']
): string {
    return summary.map((item) => item.text).join(REASONING_SUMMARY_SEPARATOR);
}

function mapMessageTextParts(
    message: ResponseOutputMessage
): AssistantContentPart[] {
    return message.content.flatMap((contentItem) =>
        contentItem.type === 'output_text' && contentItem.text.length > 0
            ? [{ type: 'text' as const, text: contentItem.text }]
            : []
    );
}

function getTextContent(parts: AssistantContentPart[]): string | null {
    return getJoinedPartText(parts, 'text', '');
}

function getReasoningText(parts: AssistantContentPart[]): string | null {
    return getJoinedPartText(parts, 'reasoning', REASONING_SUMMARY_SEPARATOR);
}

function getJoinedPartText(
    parts: AssistantContentPart[],
    type: 'text' | 'reasoning',
    separator: string
): string | null {
    const text = parts
        .flatMap((part) =>
            part.type === type && 'text' in part ? [part.text] : []
        )
        .join(separator);
    return text.length > 0 ? text : null;
}

function getToolCalls(parts: AssistantContentPart[]): ToolCall[] {
    return parts.flatMap((part) =>
        part.type === 'tool-call' ? [part.toolCall] : []
    );
}

function mapFinishReason(
    response: Response,
    hasToolCalls: boolean
): FinishReason {
    const incompleteReason = response.incomplete_details?.reason;
    if (incompleteReason === 'max_output_tokens') {
        return 'length';
    }
    if (incompleteReason === 'content_filter') {
        return 'content-filter';
    }

    if (hasToolCalls) {
        return 'tool-calls';
    }

    if (response.status === 'completed') {
        return 'stop';
    }

    return 'unknown';
}

function mapUsage(usage: ResponseUsage | undefined): GenerateResult['usage'] {
    const reasoningTokens = usage?.output_tokens_details?.reasoning_tokens;

    return {
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        inputTokenDetails: {
            cacheReadTokens: usage?.input_tokens_details?.cached_tokens ?? 0,
            cacheWriteTokens: 0,
        },
        outputTokenDetails: {
            ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
        },
    };
}

type BufferedToolCall = {
    id: string;
    name: string;
    arguments: string;
};

type ReasoningStartEvent = Extract<StreamEvent, { type: 'reasoning-start' }>;
type ReasoningEndEvent = Extract<StreamEvent, { type: 'reasoning-end' }>;

type ReasoningSummaryPart = {
    itemId: string;
    summaryIndex: number;
};

function getReasoningSummaryKey(part: ReasoningSummaryPart): string {
    return `${part.itemId}:${part.summaryIndex}`;
}

function isSameReasoningSummaryPart(
    left: ReasoningSummaryPart,
    right: ReasoningSummaryPart
): boolean {
    return (
        left.itemId === right.itemId && left.summaryIndex === right.summaryIndex
    );
}

function getReasoningStartTransition(reasoningStarted: boolean): {
    nextReasoningStarted: boolean;
    event: ReasoningStartEvent | null;
} {
    if (reasoningStarted) {
        return {
            nextReasoningStarted: true,
            event: null,
        };
    }

    return {
        nextReasoningStarted: true,
        event: { type: 'reasoning-start' },
    };
}

function getReasoningEndTransition(
    reasoningStarted: boolean,
    providerMetadata: ReasoningEndEvent['providerMetadata']
): {
    nextReasoningStarted: boolean;
    event: ReasoningEndEvent | null;
} {
    if (!reasoningStarted) {
        return {
            nextReasoningStarted: false,
            event: null,
        };
    }

    return {
        nextReasoningStarted: false,
        event: {
            type: 'reasoning-end',
            providerMetadata,
        },
    };
}

export async function* transformStream(
    stream: AsyncIterable<ResponseStreamEvent>
): AsyncIterable<StreamEvent> {
    const bufferedToolCalls = new Map<number, BufferedToolCall>();
    const emittedToolCalls = new Set<string>();
    const startedToolCalls = new Set<string>();
    const seenSummaryDeltas = new Set<string>();
    const emittedReasoningItems = new Set<string>();

    let latestResponse: Response | undefined;
    let textOpen = false;
    let reasoningStarted = false;
    let latestReasoningSummaryPart: ReasoningSummaryPart | undefined;

    const upsertBufferedToolCall = (
        outputIndex: number,
        getNextToolCall: (
            bufferedToolCall: BufferedToolCall | undefined
        ) => BufferedToolCall
    ): BufferedToolCall => {
        const nextToolCall = getNextToolCall(
            bufferedToolCalls.get(outputIndex)
        );
        bufferedToolCalls.set(outputIndex, nextToolCall);
        return nextToolCall;
    };

    const getNextReasoningStartEvent = (): ReasoningStartEvent | null => {
        const transition = getReasoningStartTransition(reasoningStarted);
        reasoningStarted = transition.nextReasoningStarted;
        return transition.event;
    };
    const startText = function* (): Iterable<StreamEvent> {
        if (textOpen) {
            return;
        }

        textOpen = true;
        yield { type: 'text-start' };
    };
    const closeText = function* (): Iterable<StreamEvent> {
        if (!textOpen) {
            return;
        }

        textOpen = false;
        yield { type: 'text-end' };
    };

    const getNextReasoningEndEvent = (
        providerMetadata: ReasoningEndEvent['providerMetadata']
    ): ReasoningEndEvent | null => {
        const transition = getReasoningEndTransition(
            reasoningStarted,
            providerMetadata
        );
        reasoningStarted = transition.nextReasoningStarted;
        if (transition.event) {
            latestReasoningSummaryPart = undefined;
        }
        return transition.event;
    };

    const getReasoningSummarySeparatorEvent = (
        currentPart: ReasoningSummaryPart
    ): Extract<StreamEvent, { type: 'reasoning-delta' }> | null => {
        const previousPart = latestReasoningSummaryPart;
        latestReasoningSummaryPart = currentPart;

        if (
            previousPart === undefined ||
            isSameReasoningSummaryPart(previousPart, currentPart)
        ) {
            return null;
        }

        return {
            type: 'reasoning-delta',
            text: REASONING_SUMMARY_SEPARATOR,
        };
    };

    for await (const event of stream) {
        if (event.type === 'response.reasoning_summary_text.delta') {
            const summaryPart = {
                itemId: event.item_id,
                summaryIndex: event.summary_index,
            };
            seenSummaryDeltas.add(getReasoningSummaryKey(summaryPart));
            emittedReasoningItems.add(event.item_id);

            const reasoningStartEvent = getNextReasoningStartEvent();
            if (reasoningStartEvent) {
                yield* closeText();
                yield reasoningStartEvent;
            }

            const separatorEvent =
                getReasoningSummarySeparatorEvent(summaryPart);
            if (separatorEvent) {
                yield separatorEvent;
            }

            yield {
                type: 'reasoning-delta',
                text: event.delta,
            };
            continue;
        }

        if (event.type === 'response.reasoning_summary_text.done') {
            const summaryPart = {
                itemId: event.item_id,
                summaryIndex: event.summary_index,
            };
            const key = getReasoningSummaryKey(summaryPart);
            if (!seenSummaryDeltas.has(key) && event.text.length > 0) {
                emittedReasoningItems.add(event.item_id);

                const reasoningStartEvent = getNextReasoningStartEvent();
                if (reasoningStartEvent) {
                    yield* closeText();
                    yield reasoningStartEvent;
                }

                const separatorEvent =
                    getReasoningSummarySeparatorEvent(summaryPart);
                if (separatorEvent) {
                    yield separatorEvent;
                }

                yield {
                    type: 'reasoning-delta',
                    text: event.text,
                };
            }
            continue;
        }

        if (event.type === 'response.output_text.delta') {
            const reasoningEndEvent = getNextReasoningEndEvent({ openai: {} });
            if (reasoningEndEvent) {
                yield reasoningEndEvent;
            }
            yield* startText();
            yield {
                type: 'text-delta',
                text: event.delta,
            };
            continue;
        }

        if (event.type === 'response.output_item.added') {
            if (!isFunctionToolCall(event.item)) {
                continue;
            }

            yield* closeText();
            const toolCallId = event.item.call_id;
            const toolCallName = event.item.name;
            const toolCallArguments = event.item.arguments;
            upsertBufferedToolCall(event.output_index, () => ({
                id: toolCallId,
                name: toolCallName,
                arguments: toolCallArguments,
            }));

            const shouldStartToolCall = !startedToolCalls.has(toolCallId);
            if (shouldStartToolCall) {
                startedToolCalls.add(toolCallId);
                yield {
                    type: 'tool-call-start',
                    toolCallId,
                    toolName: toolCallName,
                };
            }
            continue;
        }

        if (event.type === 'response.function_call_arguments.delta') {
            yield* closeText();
            const currentToolCall = upsertBufferedToolCall(
                event.output_index,
                (bufferedToolCall) => ({
                    id: bufferedToolCall?.id ?? event.item_id,
                    name: bufferedToolCall?.name ?? '',
                    arguments: `${bufferedToolCall?.arguments ?? ''}${event.delta}`,
                })
            );

            const shouldStartToolCall = !startedToolCalls.has(
                currentToolCall.id
            );
            if (shouldStartToolCall) {
                startedToolCalls.add(currentToolCall.id);
                yield {
                    type: 'tool-call-start',
                    toolCallId: currentToolCall.id,
                    toolName: currentToolCall.name,
                };
            }

            yield {
                type: 'tool-call-delta',
                toolCallId: currentToolCall.id,
                argumentsDelta: event.delta,
            };
            continue;
        }

        if (event.type === 'response.output_item.done') {
            if (isReasoningItem(event.item)) {
                if (!emittedReasoningItems.has(event.item.id)) {
                    const summaryText = getReasoningSummaryText(
                        event.item.summary
                    );
                    if (summaryText.length > 0) {
                        const reasoningStartEvent =
                            getNextReasoningStartEvent();
                        if (reasoningStartEvent) {
                            yield* closeText();
                            yield reasoningStartEvent;
                        }
                        yield {
                            type: 'reasoning-delta',
                            text: summaryText,
                        };
                    }
                }

                const encryptedContent =
                    typeof event.item.encrypted_content === 'string' &&
                    event.item.encrypted_content.length > 0
                        ? event.item.encrypted_content
                        : undefined;

                if (encryptedContent) {
                    const reasoningStartEvent = getNextReasoningStartEvent();
                    if (reasoningStartEvent) {
                        yield* closeText();
                        yield reasoningStartEvent;
                    }
                }

                const reasoningEndEvent = getNextReasoningEndEvent({
                    openai: {
                        ...(encryptedContent ? { encryptedContent } : {}),
                    },
                });
                if (reasoningEndEvent) {
                    yield reasoningEndEvent;
                }
                continue;
            }

            if (!isFunctionToolCall(event.item)) {
                continue;
            }

            yield* closeText();
            const toolCallId = event.item.call_id;
            const toolCallName = event.item.name;
            const toolCallArguments = event.item.arguments;
            const currentToolCall = upsertBufferedToolCall(
                event.output_index,
                (bufferedToolCall) => ({
                    id: toolCallId,
                    name: toolCallName,
                    arguments:
                        toolCallArguments || bufferedToolCall?.arguments || '',
                })
            );

            if (!emittedToolCalls.has(currentToolCall.id)) {
                emittedToolCalls.add(currentToolCall.id);
                yield {
                    type: 'tool-call-end',
                    toolCall: {
                        id: currentToolCall.id,
                        name: currentToolCall.name,
                        arguments: safeParseJsonObject(
                            currentToolCall.arguments
                        ),
                    },
                };
            }
            continue;
        }

        if (event.type === 'response.completed') {
            latestResponse = event.response;

            yield* closeText();
            const reasoningEndEvent = getNextReasoningEndEvent({ openai: {} });
            if (reasoningEndEvent) {
                yield reasoningEndEvent;
            }

            for (const bufferedToolCall of bufferedToolCalls.values()) {
                if (emittedToolCalls.has(bufferedToolCall.id)) {
                    continue;
                }

                emittedToolCalls.add(bufferedToolCall.id);
                yield {
                    type: 'tool-call-end',
                    toolCall: {
                        id: bufferedToolCall.id,
                        name: bufferedToolCall.name,
                        arguments: safeParseJsonObject(
                            bufferedToolCall.arguments
                        ),
                    },
                };
            }

            const hasToolCalls = bufferedToolCalls.size > 0;
            yield {
                type: 'finish',
                finishReason: mapFinishReason(latestResponse, hasToolCalls),
                usage: mapUsage(latestResponse.usage),
            };
            return;
        }
    }

    const reasoningEndEvent = getNextReasoningEndEvent({
        openai: {},
    });
    yield* closeText();
    if (reasoningEndEvent) {
        yield reasoningEndEvent;
    }

    const hasToolCalls = bufferedToolCalls.size > 0;
    const usage = latestResponse
        ? mapUsage(latestResponse.usage)
        : mapUsage(undefined);
    const finishReason = latestResponse
        ? mapFinishReason(latestResponse, hasToolCalls)
        : 'unknown';

    yield {
        type: 'finish',
        finishReason,
        usage,
    };
}

function mapReasoningToRequestFields(
    modelId: string,
    options: GenerateOptions
) {
    if (!options.reasoning) {
        return {};
    }

    const capabilities = getOpenAIModelCapabilities(modelId);
    if (!capabilities.reasoning.supported) {
        return {};
    }

    const effort = toOpenAIReasoningEffort(
        clampReasoningEffort(
            options.reasoning.effort,
            capabilities.reasoning.supportedEfforts
        )
    );

    return {
        reasoning: {
            effort,
            summary: 'auto' as const,
        },
    };
}

function isFunctionToolCall(
    item: ResponseOutputItem
): item is ResponseFunctionToolCall {
    return item.type === 'function_call';
}

function isOutputMessage(
    item: ResponseOutputItem
): item is ResponseOutputMessage {
    return item.type === 'message';
}

function isReasoningItem(
    item: ResponseOutputItem
): item is ResponseReasoningItem {
    return item.type === 'reasoning';
}
