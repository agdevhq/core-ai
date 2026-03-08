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
import { getProviderMetadata } from '@core-ai/core-ai';
import {
    clampReasoningEffort,
    getOpenAIModelCapabilities,
    toOpenAIReasoningEffort,
} from './model-capabilities.js';
import {
    convertToolChoice,
    convertTools,
    createStructuredOutputOptions,
    getStructuredOutputToolName,
} from './shared/tools.js';
import {
    safeParseJsonObject,
    validateOpenAIReasoningConfig,
} from './shared/utils.js';
import {
    parseOpenAIResponsesGenerateProviderOptions,
    type OpenAIResponsesGenerateProviderOptions,
} from './provider-options.js';

export { createStructuredOutputOptions, getStructuredOutputToolName };
export { validateOpenAIReasoningConfig };

export type OpenAIReasoningMetadata = {
    encryptedContent?: string;
};

const ENCRYPTED_REASONING_INCLUDE = 'reasoning.encrypted_content';

export function convertMessages(messages: Message[]): ResponseInputItem[] {
    return messages.flatMap(convertMessage);
}

function convertMessage(message: Message): ResponseInputItem[] {
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
        return convertAssistantMessage(message.parts);
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
    parts: AssistantContentPart[]
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
    options: GenerateOptions,
    stream: boolean
) {
    const openaiOptions = parseOpenAIResponsesGenerateProviderOptions(
        options.providerOptions
    );
    const request: Record<string, unknown> = {
        ...createRequestBase(modelId, options),
        ...(stream ? { stream: true as const } : {}),
        ...mapOpenAIProviderOptionsToRequestFields(openaiOptions),
    };

    if (options.reasoning) {
        request.include = mergeInclude(request.include, [
            ENCRYPTED_REASONING_INCLUDE,
        ]);
    }

    return request;
}

function createRequestBase(modelId: string, options: GenerateOptions) {
    validateOpenAIReasoningConfig(modelId, options);

    return {
        model: modelId,
        store: false as const,
        input: convertMessages(options.messages),
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
    return summary.map((item) => item.text).join('');
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
    return getJoinedPartText(parts, 'text');
}

function getReasoningText(parts: AssistantContentPart[]): string | null {
    return getJoinedPartText(parts, 'reasoning');
}

function getJoinedPartText(
    parts: AssistantContentPart[],
    type: 'text' | 'reasoning'
): string | null {
    const text = parts
        .flatMap((part) =>
            part.type === type && 'text' in part ? [part.text] : []
        )
        .join('');
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

export async function* transformStream(
    stream: AsyncIterable<ResponseStreamEvent>
): AsyncIterable<StreamEvent> {
    const bufferedToolCalls = new Map<number, BufferedToolCall>();
    const emittedToolCalls = new Set<string>();
    const startedToolCalls = new Set<string>();
    const seenSummaryDeltas = new Set<string>();
    const emittedReasoningItems = new Set<string>();

    let latestResponse: Response | undefined;
    let reasoningStarted = false;

    const markReasoningStarted = (): boolean => {
        if (reasoningStarted) {
            return false;
        }
        reasoningStarted = true;
        return true;
    };

    const markReasoningEnded = (): boolean => {
        if (!reasoningStarted) {
            return false;
        }
        reasoningStarted = false;
        return true;
    };

    const markToolCallStarted = (toolCallId: string): boolean => {
        if (startedToolCalls.has(toolCallId)) {
            return false;
        }
        startedToolCalls.add(toolCallId);
        return true;
    };

    const getOrCreateBufferedToolCall = (
        outputIndex: number,
        fallback: BufferedToolCall
    ): BufferedToolCall => {
        const existing = bufferedToolCalls.get(outputIndex);
        if (existing) {
            return existing;
        }
        const created = { ...fallback };
        bufferedToolCalls.set(outputIndex, created);
        return created;
    };

    for await (const event of stream) {
        if (event.type === 'response.reasoning_summary_text.delta') {
            seenSummaryDeltas.add(`${event.item_id}:${event.summary_index}`);
            emittedReasoningItems.add(event.item_id);

            if (markReasoningStarted()) {
                yield { type: 'reasoning-start' };
            }

            yield {
                type: 'reasoning-delta',
                text: event.delta,
            };
            continue;
        }

        if (event.type === 'response.reasoning_summary_text.done') {
            const key = `${event.item_id}:${event.summary_index}`;
            if (!seenSummaryDeltas.has(key) && event.text.length > 0) {
                emittedReasoningItems.add(event.item_id);

                if (markReasoningStarted()) {
                    yield { type: 'reasoning-start' };
                }

                yield {
                    type: 'reasoning-delta',
                    text: event.text,
                };
            }
            continue;
        }

        if (event.type === 'response.output_text.delta') {
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

            const toolCallId = event.item.call_id;
            const currentToolCall = getOrCreateBufferedToolCall(
                event.output_index,
                {
                    id: toolCallId,
                    name: event.item.name,
                    arguments: event.item.arguments,
                }
            );
            currentToolCall.id = toolCallId;
            currentToolCall.name = event.item.name;
            currentToolCall.arguments = event.item.arguments;

            if (markToolCallStarted(toolCallId)) {
                yield {
                    type: 'tool-call-start',
                    toolCallId,
                    toolName: event.item.name,
                };
            }
            continue;
        }

        if (event.type === 'response.function_call_arguments.delta') {
            const currentToolCall = getOrCreateBufferedToolCall(
                event.output_index,
                {
                    id: event.item_id,
                    name: '',
                    arguments: '',
                }
            );
            currentToolCall.arguments += event.delta;
            bufferedToolCalls.set(event.output_index, currentToolCall);

            if (markToolCallStarted(currentToolCall.id)) {
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
                        if (markReasoningStarted()) {
                            yield { type: 'reasoning-start' };
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

                if (!reasoningStarted && encryptedContent) {
                    markReasoningStarted();
                    yield { type: 'reasoning-start' };
                }

                if (markReasoningEnded()) {
                    yield {
                        type: 'reasoning-end',
                        providerMetadata: {
                            openai: {
                                ...(encryptedContent
                                    ? { encryptedContent }
                                    : {}),
                            },
                        },
                    };
                }
                continue;
            }

            if (!isFunctionToolCall(event.item)) {
                continue;
            }

            const currentToolCall = getOrCreateBufferedToolCall(
                event.output_index,
                {
                    id: event.item.call_id,
                    name: event.item.name,
                    arguments: '',
                }
            );

            currentToolCall.id = event.item.call_id;
            currentToolCall.name = event.item.name;
            currentToolCall.arguments =
                event.item.arguments || currentToolCall.arguments;

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

            if (markReasoningEnded()) {
                yield {
                    type: 'reasoning-end',
                    providerMetadata: { openai: {} },
                };
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

    if (markReasoningEnded()) {
        yield { type: 'reasoning-end', providerMetadata: { openai: {} } };
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
    const effort = capabilities.reasoning.supportsEffort
        ? toOpenAIReasoningEffort(
              clampReasoningEffort(
                  options.reasoning.effort,
                  capabilities.reasoning.supportedRange
              )
          )
        : undefined;

    return {
        reasoning: {
            ...(effort ? { effort } : {}),
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
