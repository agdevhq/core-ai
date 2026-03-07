import type {
    ChatCompletionRequest,
    ChatCompletionRequestToolChoice,
    ChatCompletionResponse,
    ChatCompletionStreamRequest,
    CompletionEvent,
    ContentChunk,
    Messages as MistralMessage,
    Tool as MistralTool,
    ToolCall as MistralToolCall,
    UsageInfo,
} from '@mistralai/mistralai/models/components';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type {
    AssistantContentPart,
    FinishReason,
    GenerateObjectOptions,
    GenerateOptions,
    GenerateResult,
    Message,
    StreamEvent,
    ToolCall,
    ToolChoice,
    ToolSet,
    UserContentPart,
} from '@core-ai/core-ai';
import {
    parseMistralGenerateProviderOptions,
    type MistralGenerateProviderOptions,
} from './provider-options.js';

export const DEFAULT_STRUCTURED_OUTPUT_TOOL_NAME = 'core_ai_generate_object';
export const DEFAULT_STRUCTURED_OUTPUT_TOOL_DESCRIPTION =
    'Return a JSON object that matches the requested schema.';

export function convertMessages(messages: Message[]): MistralMessage[] {
    return messages.map(convertMessage);
}

function convertMessage(message: Message): MistralMessage {
    if (message.role === 'system') {
        return {
            role: 'system',
            content: message.content,
        };
    }

    if (message.role === 'user') {
        return {
            role: 'user',
            content:
                typeof message.content === 'string'
                    ? message.content
                    : message.content.map(convertUserContentPart),
        };
    }

    if (message.role === 'assistant') {
        const contentChunks: ContentChunk[] = [];
        const toolCalls = message.parts.flatMap((part) =>
            part.type === 'tool-call' ? [part.toolCall] : []
        );

        for (const part of message.parts) {
            if (part.type === 'text') {
                contentChunks.push({ type: 'text', text: part.text });
            } else if (part.type === 'reasoning' && part.text.length > 0) {
                contentChunks.push({
                    type: 'thinking',
                    thinking: [{ type: 'text', text: part.text }],
                });
            }
        }

        return {
            role: 'assistant',
            content: contentChunks.length > 0 ? contentChunks : null,
            ...(toolCalls.length > 0
                ? {
                      toolCalls: toolCalls.map((toolCall) => ({
                          id: toolCall.id,
                          type: 'function',
                          function: {
                              name: toolCall.name,
                              arguments: toolCall.arguments,
                          },
                      })),
                  }
                : {}),
        };
    }

    return {
        role: 'tool',
        toolCallId: message.toolCallId,
        content: message.content,
    };
}

function convertUserContentPart(part: UserContentPart): ContentChunk {
    if (part.type === 'text') {
        return {
            type: 'text',
            text: part.text,
        };
    }

    if (part.type === 'image') {
        const url =
            part.source.type === 'url'
                ? part.source.url
                : `data:${part.source.mediaType};base64,${part.source.data}`;

        return {
            type: 'image_url',
            imageUrl: {
                url,
            },
        };
    }

    return {
        type: 'document_url',
        documentUrl: `data:${part.mimeType};base64,${part.data}`,
        ...(part.filename ? { documentName: part.filename } : {}),
    };
}

export function convertTools(tools: ToolSet): MistralTool[] {
    return Object.values(tools).map((tool) => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: zodToJsonSchema(tool.parameters) as Record<
                string,
                unknown
            >,
        },
    }));
}

export function convertToolChoice(
    choice: ToolChoice
): ChatCompletionRequestToolChoice {
    if (typeof choice === 'string') {
        return choice;
    }

    return {
        type: 'function',
        function: {
            name: choice.toolName,
        },
    };
}

export function getStructuredOutputToolName<TSchema extends z.ZodType>(
    options: GenerateObjectOptions<TSchema>
): string {
    return options.schemaName?.trim() || DEFAULT_STRUCTURED_OUTPUT_TOOL_NAME;
}

export function createStructuredOutputOptions<TSchema extends z.ZodType>(
    options: GenerateObjectOptions<TSchema>
): GenerateOptions {
    const toolName = getStructuredOutputToolName(options);

    return {
        messages: options.messages,
        tools: {
            structured_output: {
                name: toolName,
                description:
                    options.schemaDescription ??
                    DEFAULT_STRUCTURED_OUTPUT_TOOL_DESCRIPTION,
                parameters: options.schema,
            },
        },
        toolChoice: {
            type: 'tool',
            toolName,
        },
        reasoning: options.reasoning,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        topP: options.topP,
        providerOptions: options.providerOptions,
        signal: options.signal,
    };
}

export function createGenerateRequest(
    modelId: string,
    options: GenerateOptions
): ChatCompletionRequest {
    const mistralOptions = parseMistralGenerateProviderOptions(
        options.providerOptions
    );
    const baseRequest: ChatCompletionRequest = {
        ...createRequestBase(modelId, options),
    };

    return mapMistralProviderOptionsToRequest(baseRequest, mistralOptions);
}

export function createStreamRequest(
    modelId: string,
    options: GenerateOptions
): ChatCompletionStreamRequest {
    const mistralOptions = parseMistralGenerateProviderOptions(
        options.providerOptions
    );
    const baseRequest: ChatCompletionStreamRequest = {
        ...createRequestBase(modelId, options),
        stream: true,
    };

    return mapMistralProviderOptionsToRequest(baseRequest, mistralOptions);
}

function createRequestBase(modelId: string, options: GenerateOptions) {
    return {
        model: modelId,
        messages: convertMessages(options.messages),
        ...(options.tools && Object.keys(options.tools).length > 0
            ? { tools: convertTools(options.tools) }
            : {}),
        ...(options.toolChoice
            ? { toolChoice: convertToolChoice(options.toolChoice) }
            : {}),
        ...mapSamplingToRequestFields(options),
    };
}

function mapSamplingToRequestFields(
    options: Pick<GenerateOptions, 'temperature' | 'maxTokens' | 'topP'>
) {
    return {
        ...(options.temperature !== undefined
            ? { temperature: options.temperature }
            : {}),
        ...(options.maxTokens !== undefined
            ? { maxTokens: options.maxTokens }
            : {}),
        ...(options.topP !== undefined ? { topP: options.topP } : {}),
    };
}

function mapMistralProviderOptionsToRequest<TRequest extends object>(
    baseRequest: TRequest,
    providerOptions: MistralGenerateProviderOptions | undefined
): TRequest {
    if (!providerOptions) {
        return baseRequest;
    }

    return {
        ...baseRequest,
        ...(providerOptions.stopSequences
            ? { stop: providerOptions.stopSequences }
            : {}),
        ...(providerOptions.frequencyPenalty !== undefined
            ? { frequencyPenalty: providerOptions.frequencyPenalty }
            : {}),
        ...(providerOptions.presencePenalty !== undefined
            ? { presencePenalty: providerOptions.presencePenalty }
            : {}),
        ...(providerOptions.randomSeed !== undefined
            ? { randomSeed: providerOptions.randomSeed }
            : {}),
        ...(providerOptions.parallelToolCalls !== undefined
            ? { parallelToolCalls: providerOptions.parallelToolCalls }
            : {}),
        ...(providerOptions.promptMode !== undefined
            ? { promptMode: providerOptions.promptMode }
            : {}),
        ...(providerOptions.safePrompt !== undefined
            ? { safePrompt: providerOptions.safePrompt }
            : {}),
    };
}

export function mapGenerateResponse(
    response: ChatCompletionResponse
): GenerateResult {
    const firstChoice = response.choices[0];
    if (!firstChoice) {
        return {
            parts: [],
            content: null,
            reasoning: null,
            toolCalls: [],
            finishReason: 'unknown',
            usage: mapUsage(response.usage),
        };
    }

    const parts = extractAssistantParts(firstChoice.message);
    const toolCalls = parts.flatMap((part) =>
        part.type === 'tool-call' ? [part.toolCall] : []
    );
    const content = parts
        .flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join('');
    const reasoning = parts
        .flatMap((part) => (part.type === 'reasoning' ? [part.text] : []))
        .join('');
    const mappedFinishReason = mapFinishReason(firstChoice.finishReason);

    return {
        parts,
        content: content.length > 0 ? content : null,
        reasoning: reasoning.length > 0 ? reasoning : null,
        toolCalls,
        finishReason:
            toolCalls.length > 0 && mappedFinishReason !== 'content-filter'
                ? 'tool-calls'
                : mappedFinishReason,
        usage: mapUsage(response.usage),
    };
}

type BufferedToolCall = {
    id: string;
    name: string;
    arguments: string;
};

export async function* transformStream(
    stream: AsyncIterable<CompletionEvent>
): AsyncIterable<StreamEvent> {
    const bufferedToolCalls = new Map<number, BufferedToolCall>();
    const emittedToolCalls = new Set<number>();

    let finishReason: FinishReason = 'unknown';
    let reasoningOpen = false;
    let usage: GenerateResult['usage'] = {
        inputTokens: 0,
        outputTokens: 0,
        inputTokenDetails: {
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
        },
        outputTokenDetails: {},
    };
    const closeReasoning = (): StreamEvent | null => {
        if (!reasoningOpen) {
            return null;
        }

        reasoningOpen = false;
        return {
            type: 'reasoning-end',
            providerMetadata: { mistral: {} },
        };
    };

    for await (const event of stream) {
        const chunk = event.data;

        if (chunk.usage) {
            usage = mapUsage(chunk.usage);
        }

        const choice = chunk.choices[0];
        if (!choice) {
            continue;
        }

        const thinkingDeltas = extractThinkingDeltas(choice.delta.content);
        if (thinkingDeltas.length > 0) {
            if (!reasoningOpen) {
                reasoningOpen = true;
                yield {
                    type: 'reasoning-start',
                };
            }
            for (const thinkingDelta of thinkingDeltas) {
                yield {
                    type: 'reasoning-delta',
                    text: thinkingDelta,
                };
            }
        }

        for (const textDelta of extractTextDeltas(choice.delta.content)) {
            const reasoningEnd = closeReasoning();
            if (reasoningEnd) {
                yield reasoningEnd;
            }
            yield {
                type: 'text-delta',
                text: textDelta,
            };
        }

        if (choice.delta.toolCalls) {
            const reasoningEnd = closeReasoning();
            if (reasoningEnd) {
                yield reasoningEnd;
            }
            for (const [
                position,
                partialToolCall,
            ] of choice.delta.toolCalls.entries()) {
                const streamIndex = partialToolCall.index ?? position;
                const current = bufferedToolCalls.get(streamIndex) ?? {
                    id: partialToolCall.id ?? `tool-${streamIndex}`,
                    name: partialToolCall.function.name,
                    arguments: '',
                };

                const isNew = !bufferedToolCalls.has(streamIndex);

                if (partialToolCall.id) {
                    current.id = partialToolCall.id;
                }

                if (partialToolCall.function.name) {
                    current.name = partialToolCall.function.name;
                }

                const argumentDelta = partialToolCall.function.arguments;
                if (typeof argumentDelta === 'string') {
                    current.arguments += argumentDelta;
                    yield {
                        type: 'tool-call-delta',
                        toolCallId: current.id,
                        argumentsDelta: argumentDelta,
                    };
                } else {
                    const serializedArguments =
                        serializeJsonObject(argumentDelta);
                    if (serializedArguments.length > 0) {
                        current.arguments = serializedArguments;
                        yield {
                            type: 'tool-call-delta',
                            toolCallId: current.id,
                            argumentsDelta: serializedArguments,
                        };
                    }
                }

                bufferedToolCalls.set(streamIndex, current);

                if (isNew) {
                    yield {
                        type: 'tool-call-start',
                        toolCallId: current.id,
                        toolName: current.name,
                    };
                }
            }
        }

        if (choice.finishReason) {
            finishReason = mapFinishReason(choice.finishReason);
        }

        if (finishReason === 'tool-calls') {
            yield* emitBufferedToolCalls(bufferedToolCalls, emittedToolCalls);
        }
    }

    const reasoningEnd = closeReasoning();
    if (reasoningEnd) {
        yield reasoningEnd;
    }

    yield* emitBufferedToolCalls(bufferedToolCalls, emittedToolCalls);

    yield {
        type: 'finish',
        finishReason,
        usage,
    };
}

function* emitBufferedToolCalls(
    bufferedToolCalls: Map<number, BufferedToolCall>,
    emittedToolCalls: Set<number>
): Iterable<StreamEvent> {
    for (const [toolCallIndex, toolCall] of bufferedToolCalls.entries()) {
        if (emittedToolCalls.has(toolCallIndex)) {
            continue;
        }

        emittedToolCalls.add(toolCallIndex);
        yield {
            type: 'tool-call-end',
            toolCall: {
                id: toolCall.id,
                name: toolCall.name,
                arguments: safeParseJsonObject(toolCall.arguments),
            },
        };
    }
}

function parseToolCalls(
    calls: MistralToolCall[] | null | undefined
): ToolCall[] {
    if (!calls || calls.length === 0) {
        return [];
    }

    return calls.map((toolCall, index) => ({
        id: toolCall.id ?? `tool-${index}`,
        name: toolCall.function.name,
        arguments: toObject(toolCall.function.arguments),
    }));
}

function mapFinishReason(reason: string | null | undefined): FinishReason {
    if (reason === 'stop') {
        return 'stop';
    }
    if (reason === 'length' || reason === 'model_length') {
        return 'length';
    }
    if (reason === 'tool_calls') {
        return 'tool-calls';
    }
    return 'unknown';
}

function mapUsage(usage: UsageInfo | undefined): GenerateResult['usage'] {
    return {
        inputTokens: usage?.promptTokens ?? 0,
        outputTokens: usage?.completionTokens ?? 0,
        inputTokenDetails: {
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
        },
        outputTokenDetails: {},
    };
}

function extractAssistantParts(message: {
    content?: string | ContentChunk[] | null | undefined;
    toolCalls?: MistralToolCall[] | null | undefined;
}): AssistantContentPart[] {
    const parts: AssistantContentPart[] = [];

    if (typeof message.content === 'string') {
        if (message.content.length > 0) {
            parts.push({
                type: 'text',
                text: message.content,
            });
        }
    } else if (Array.isArray(message.content)) {
        for (const chunk of message.content) {
            if (chunk.type === 'text') {
                parts.push({
                    type: 'text',
                    text: chunk.text,
                });
                continue;
            }

            if (chunk.type === 'thinking') {
                const thinkingText = extractThinkingText(chunk.thinking);
                parts.push({
                    type: 'reasoning',
                    text: thinkingText,
                    providerMetadata: { mistral: {} },
                });
            }
        }
    }

    for (const toolCall of parseToolCalls(message.toolCalls)) {
        parts.push({
            type: 'tool-call',
            toolCall,
        });
    }

    return parts;
}

function extractTextDeltas(
    content: string | ContentChunk[] | null | undefined
): string[] {
    if (typeof content === 'string') {
        return [content];
    }
    if (!content || content.length === 0) {
        return [];
    }

    return content.flatMap((chunk) =>
        chunk.type === 'text' ? [chunk.text] : []
    );
}

function extractThinkingDeltas(
    content: string | ContentChunk[] | null | undefined
): string[] {
    if (!content || typeof content === 'string') {
        return [];
    }

    return content.flatMap((chunk) => {
        if (chunk.type !== 'thinking') {
            return [];
        }

        const thinkingText = extractThinkingText(chunk.thinking);
        if (thinkingText.length === 0) {
            return [];
        }
        return [thinkingText];
    });
}

function extractThinkingText(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    if (!Array.isArray(value)) {
        return '';
    }

    return value
        .flatMap((part) => {
            if (!part || typeof part !== 'object') {
                return [];
            }
            const text = (part as { text?: unknown }).text;
            return typeof text === 'string' ? [text] : [];
        })
        .join('');
}

function serializeJsonObject(value: unknown): string {
    const objectValue = asObject(value);
    return Object.keys(objectValue).length > 0
        ? JSON.stringify(objectValue)
        : '';
}

function toObject(value: unknown): Record<string, unknown> {
    if (typeof value === 'string') {
        return safeParseJsonObject(value);
    }
    return asObject(value);
}

function safeParseJsonObject(json: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(json) as unknown;
        return asObject(parsed);
    } catch {
        return {};
    }
}

function asObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return {};
}
