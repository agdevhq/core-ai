import { APIError } from 'openai';
import type OpenAI from 'openai';
import type {
    ChatCompletion,
    ChatCompletionChunk,
    ChatCompletionMessageFunctionToolCall,
} from 'openai/resources/chat/completions/completions';
import { ProviderError } from '@core-ai/ai';
import type {
    ChatModel,
    FinishReason,
    GenerateOptions,
    GenerateResult,
    StreamEvent,
    StreamResult,
    ToolCall,
} from '@core-ai/ai';
import { createStreamResult } from './stream-result.js';
import {
    convertMessages,
    convertToolChoice,
    convertTools,
} from './chat-convert.js';

type OpenAIChatClient = {
    chat: OpenAI['chat'];
};

export function createOpenAIChatModel(
    client: OpenAIChatClient,
    modelId: string
): ChatModel {
    return {
        provider: 'openai',
        modelId,
        async generate(options: GenerateOptions): Promise<GenerateResult> {
            try {
                const response = await client.chat.completions.create({
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
                });

                return mapGenerateResponse(response as ChatCompletion);
            } catch (error) {
                throw wrapError(error);
            }
        },
        async stream(options: GenerateOptions): Promise<StreamResult> {
            try {
                const stream = (await client.chat.completions.create({
                    model: modelId,
                    messages: convertMessages(options.messages),
                    stream: true,
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
                })) as unknown as AsyncIterable<ChatCompletionChunk>;

                return createStreamResult(transformStream(stream));
            } catch (error) {
                throw wrapError(error);
            }
        },
    };
}

function mapGenerateResponse(response: ChatCompletion): GenerateResult {
    const firstChoice = response.choices[0];

    if (!firstChoice) {
        return {
            content: null,
            toolCalls: [],
            finishReason: 'unknown',
            usage: {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
            },
        };
    }

    return {
        content: firstChoice.message.content,
        toolCalls: parseToolCalls(firstChoice.message.tool_calls),
        finishReason: mapFinishReason(firstChoice.finish_reason),
        usage: {
            inputTokens: response.usage?.prompt_tokens ?? 0,
            outputTokens: response.usage?.completion_tokens ?? 0,
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

async function* transformStream(
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
        totalTokens: 0,
    };

    for await (const chunk of stream) {
        if (chunk.usage) {
            usage = {
                inputTokens: chunk.usage.prompt_tokens ?? 0,
                outputTokens: chunk.usage.completion_tokens ?? 0,
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
                const current = bufferedToolCalls.get(
                    partialToolCall.index
                ) ?? {
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

function wrapError(error: unknown): ProviderError {
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
