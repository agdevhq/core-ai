import { APIError } from 'openai';
import type {
    ChatCompletion,
    ChatCompletionChunk,
    ChatCompletionContentPart,
    ChatCompletionMessageFunctionToolCall,
    ChatCompletionMessageParam,
    ChatCompletionTool,
    ChatCompletionToolChoiceOption,
} from 'openai/resources/chat/completions/completions';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ProviderError } from '@core-ai/core-ai';
import type {
    FinishReason,
    GenerateOptions,
    GenerateResult,
    Message,
    StreamEvent,
    ToolChoice,
    ToolCall,
    ToolSet,
    UserContentPart,
} from '@core-ai/core-ai';

export function convertMessages(
    messages: Message[]
): ChatCompletionMessageParam[] {
    return messages.map(convertMessage);
}

function convertMessage(message: Message): ChatCompletionMessageParam {
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
                      tool_calls: message.toolCalls.map((toolCall) => ({
                          id: toolCall.id,
                          type: 'function' as const,
                          function: {
                              name: toolCall.name,
                              arguments: JSON.stringify(toolCall.arguments),
                          },
                      })),
                  }
                : {}),
        };
    }

    return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: message.content,
    };
}

function convertUserContentPart(
    part: UserContentPart
): ChatCompletionContentPart {
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
            image_url: {
                url,
            },
        };
    }

    return {
        type: 'file',
        file: {
            file_data: part.data,
            ...(part.filename ? { filename: part.filename } : {}),
        },
    };
}

export function convertTools(tools: ToolSet): ChatCompletionTool[] {
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
): ChatCompletionToolChoiceOption {
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

export function createGenerateRequest(modelId: string, options: GenerateOptions) {
    return {
        model: modelId,
        messages: convertMessages(options.messages),
        ...(options.tools && Object.keys(options.tools).length > 0
            ? { tools: convertTools(options.tools) }
            : {}),
        ...(options.toolChoice
            ? { tool_choice: convertToolChoice(options.toolChoice) }
            : {}),
        ...(options.config?.temperature !== undefined
            ? { temperature: options.config.temperature }
            : {}),
        ...(options.config?.maxTokens !== undefined
            ? { max_tokens: options.config.maxTokens }
            : {}),
        ...(options.config?.topP !== undefined
            ? { top_p: options.config.topP }
            : {}),
        ...(options.config?.stopSequences
            ? { stop: options.config.stopSequences }
            : {}),
        ...(options.config?.frequencyPenalty !== undefined
            ? { frequency_penalty: options.config.frequencyPenalty }
            : {}),
        ...(options.config?.presencePenalty !== undefined
            ? { presence_penalty: options.config.presencePenalty }
            : {}),
        ...options.providerOptions,
    };
}

export function createStreamRequest(modelId: string, options: GenerateOptions) {
    return {
        model: modelId,
        messages: convertMessages(options.messages),
        stream: true as const,
        stream_options: {
            include_usage: true,
        },
        ...(options.tools && Object.keys(options.tools).length > 0
            ? { tools: convertTools(options.tools) }
            : {}),
        ...(options.toolChoice
            ? { tool_choice: convertToolChoice(options.toolChoice) }
            : {}),
        ...(options.config?.temperature !== undefined
            ? { temperature: options.config.temperature }
            : {}),
        ...(options.config?.maxTokens !== undefined
            ? { max_tokens: options.config.maxTokens }
            : {}),
        ...(options.config?.topP !== undefined
            ? { top_p: options.config.topP }
            : {}),
        ...(options.config?.stopSequences
            ? { stop: options.config.stopSequences }
            : {}),
        ...(options.config?.frequencyPenalty !== undefined
            ? { frequency_penalty: options.config.frequencyPenalty }
            : {}),
        ...(options.config?.presencePenalty !== undefined
            ? { presence_penalty: options.config.presencePenalty }
            : {}),
        ...options.providerOptions,
    };
}

export function mapGenerateResponse(response: ChatCompletion): GenerateResult {
    const firstChoice = response.choices[0];

    if (!firstChoice) {
        return {
            content: null,
            toolCalls: [],
            finishReason: 'unknown',
            usage: {
                inputTokens: 0,
                outputTokens: 0,
                reasoningTokens: 0,
                totalTokens: 0,
            },
        };
    }

    const reasoningTokens =
        response.usage?.completion_tokens_details?.reasoning_tokens ?? 0;

    return {
        content: firstChoice.message.content,
        toolCalls: parseToolCalls(firstChoice.message.tool_calls),
        finishReason: mapFinishReason(firstChoice.finish_reason),
        usage: {
            inputTokens: response.usage?.prompt_tokens ?? 0,
            outputTokens: response.usage?.completion_tokens ?? 0,
            reasoningTokens,
            totalTokens: response.usage?.total_tokens ?? 0,
        },
    };
}

function parseToolCalls(
    calls:
        | ChatCompletion['choices'][number]['message']['tool_calls']
        | undefined
): ToolCall[] {
    if (!calls) {
        return [];
    }

    return calls.flatMap((toolCall) => {
        if (toolCall.type !== 'function') {
            return [];
        }

        return [mapFunctionToolCall(toolCall)];
    });
}

function mapFunctionToolCall(
    toolCall: ChatCompletionMessageFunctionToolCall
): ToolCall {
    return {
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: safeParseJsonObject(toolCall.function.arguments),
    };
}

function mapFinishReason(reason: string | null): FinishReason {
    if (reason === 'stop') {
        return 'stop';
    }
    if (reason === 'length') {
        return 'length';
    }
    if (reason === 'tool_calls' || reason === 'function_call') {
        return 'tool-calls';
    }
    if (reason === 'content_filter') {
        return 'content-filter';
    }
    return 'unknown';
}

export async function* transformStream(
    stream: AsyncIterable<ChatCompletionChunk>
): AsyncIterable<StreamEvent> {
    const bufferedToolCalls = new Map<
        number,
        {
            id: string;
            name: string;
            arguments: string;
        }
    >();
    const emittedToolCalls = new Set<string>();

    let finishReason: FinishReason = 'unknown';
    let usage = {
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
    };

    for await (const chunk of stream) {
        if (chunk.usage) {
            usage = {
                inputTokens: chunk.usage.prompt_tokens ?? 0,
                outputTokens: chunk.usage.completion_tokens ?? 0,
                reasoningTokens:
                    chunk.usage.completion_tokens_details?.reasoning_tokens ?? 0,
                totalTokens: chunk.usage.total_tokens ?? 0,
            };
        }

        const choice = chunk.choices[0];
        if (!choice) {
            continue;
        }

        if (choice.delta.content) {
            yield {
                type: 'content-delta',
                text: choice.delta.content,
            };
        }

        if (choice.delta.tool_calls) {
            for (const partialToolCall of choice.delta.tool_calls) {
                const current = bufferedToolCalls.get(partialToolCall.index) ?? {
                    id: partialToolCall.id ?? `tool-${partialToolCall.index}`,
                    name: partialToolCall.function?.name ?? '',
                    arguments: '',
                };

                const wasNew = !bufferedToolCalls.has(partialToolCall.index);

                if (partialToolCall.id) {
                    current.id = partialToolCall.id;
                }
                if (partialToolCall.function?.name) {
                    current.name = partialToolCall.function.name;
                }
                if (partialToolCall.function?.arguments) {
                    current.arguments += partialToolCall.function.arguments;
                    yield {
                        type: 'tool-call-delta',
                        toolCallId: current.id,
                        argumentsDelta: partialToolCall.function.arguments,
                    };
                }

                bufferedToolCalls.set(partialToolCall.index, current);

                if (wasNew) {
                    yield {
                        type: 'tool-call-start',
                        toolCallId: current.id,
                        toolName: current.name,
                    };
                }
            }
        }

        if (choice.finish_reason) {
            finishReason = mapFinishReason(choice.finish_reason);
        }

        if (finishReason === 'tool-calls') {
            for (const toolCall of bufferedToolCalls.values()) {
                if (emittedToolCalls.has(toolCall.id)) {
                    continue;
                }

                emittedToolCalls.add(toolCall.id);
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
    }

    yield {
        type: 'finish',
        finishReason,
        usage,
    };
}

function safeParseJsonObject(json: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(json) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
        return {};
    } catch {
        return {};
    }
}

export function wrapError(error: unknown): ProviderError {
    if (error instanceof APIError) {
        return new ProviderError(error.message, 'openai', error.status, error);
    }

    return new ProviderError(
        error instanceof Error ? error.message : String(error),
        'openai',
        undefined,
        error
    );
}
