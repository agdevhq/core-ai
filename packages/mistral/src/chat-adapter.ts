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
        return {
            role: 'assistant',
            content: message.content,
            ...(message.toolCalls && message.toolCalls.length > 0
                ? {
                      toolCalls: message.toolCalls.map((toolCall) => ({
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
    const trimmedName = options.schemaName?.trim();
    if (trimmedName && trimmedName.length > 0) {
        return trimmedName;
    }
    return DEFAULT_STRUCTURED_OUTPUT_TOOL_NAME;
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
        config: options.config,
        providerOptions: options.providerOptions,
        signal: options.signal,
    };
}

export function createGenerateRequest(
    modelId: string,
    options: GenerateOptions
): ChatCompletionRequest {
    const baseRequest: ChatCompletionRequest = {
        ...createRequestBase(modelId, options),
    };

    return mergeProviderOptions(baseRequest, options.providerOptions);
}

export function createStreamRequest(
    modelId: string,
    options: GenerateOptions
): ChatCompletionStreamRequest {
    const baseRequest: ChatCompletionStreamRequest = {
        ...createRequestBase(modelId, options),
        stream: true,
    };

    return mergeProviderOptions(baseRequest, options.providerOptions);
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
        ...mapConfigToRequestFields(options.config),
    };
}

function mapConfigToRequestFields(config: GenerateOptions['config']) {
    return {
        ...(config?.temperature !== undefined
            ? { temperature: config.temperature }
            : {}),
        ...(config?.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
        ...(config?.topP !== undefined ? { topP: config.topP } : {}),
        ...(config?.stopSequences ? { stop: config.stopSequences } : {}),
        ...(config?.frequencyPenalty !== undefined
            ? { frequencyPenalty: config.frequencyPenalty }
            : {}),
        ...(config?.presencePenalty !== undefined
            ? { presencePenalty: config.presencePenalty }
            : {}),
    };
}

function mergeProviderOptions<TRequest extends object>(
    baseRequest: TRequest,
    providerOptions: Record<string, unknown> | undefined
): TRequest {
    return providerOptions
        ? {
              ...baseRequest,
              ...(providerOptions as Partial<TRequest>),
          }
        : baseRequest;
}

export function mapGenerateResponse(
    response: ChatCompletionResponse
): GenerateResult {
    const firstChoice = response.choices[0];
    if (!firstChoice) {
        return {
            content: null,
            toolCalls: [],
            finishReason: 'unknown',
            usage: mapUsage(response.usage),
        };
    }

    const toolCalls = parseToolCalls(firstChoice.message.toolCalls);
    const mappedFinishReason = mapFinishReason(firstChoice.finishReason);

    return {
        content: extractTextContent(firstChoice.message.content),
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
    let usage: GenerateResult['usage'] = {
        inputTokens: 0,
        outputTokens: 0,
        inputTokenDetails: {
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
        },
        outputTokenDetails: {
            reasoningTokens: 0,
        },
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

        for (const textDelta of extractTextDeltas(choice.delta.content)) {
            yield {
                type: 'content-delta',
                text: textDelta,
            };
        }

        if (choice.delta.toolCalls) {
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
        outputTokenDetails: {
            reasoningTokens: 0,
        },
    };
}

function extractTextContent(
    content: string | ContentChunk[] | null | undefined
): string | null {
    if (typeof content === 'string') {
        return content;
    }
    if (!content || content.length === 0) {
        return null;
    }

    const text = content
        .flatMap((chunk) => (chunk.type === 'text' ? [chunk.text] : []))
        .join('');

    return text.length > 0 ? text : null;
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
