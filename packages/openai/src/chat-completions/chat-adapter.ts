import type {
    ChatCompletion,
    ChatCompletionChunk,
    ChatCompletionContentPart,
    ChatCompletionMessageFunctionToolCall,
    ChatCompletionMessageParam,
} from 'openai/resources/chat/completions/completions';
import type {
    AssistantContentPart,
    FinishReason,
    GenerateOptions,
    GenerateResult,
    Message,
    StreamEvent,
    ToolCall,
    UserContentPart,
} from '@core-ai/core-ai';
import { clampReasoningEffort } from '@core-ai/core-ai';
import {
    getOpenAIModelCapabilities,
    toOpenAIReasoningEffort,
} from '../model-capabilities.js';
import {
    convertToolChoice,
    convertTools,
    createStructuredOutputOptions,
    getStructuredOutputToolName,
} from '../shared/tools.js';
import {
    safeParseJsonObject,
    validateOpenAIReasoningConfig,
} from '../shared/utils.js';
import {
    parseOpenAIChatGenerateProviderOptions,
    type OpenAIChatGenerateProviderOptions,
} from '../provider-options.js';
import { extractCompatibleReasoningText } from './compatibility.js';

export type OpenAIChatCompletionsAdapterOptions = {
    compatibility?: boolean;
};

export {
    convertToolChoice,
    convertTools,
    createStructuredOutputOptions,
    getStructuredOutputToolName,
    validateOpenAIReasoningConfig,
};

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
        const text = message.parts
            .flatMap((part) => {
                if (part.type === 'text') return [part.text];
                // Chat Completions API has no native reasoning item type — fold reasoning
                // into the text content wrapped in <thinking> tags to preserve context.
                if (part.type === 'reasoning' && part.text.length > 0) {
                    return [`<thinking>${part.text}</thinking>`];
                }
                return [];
            })
            .join('\n\n');
        const toolCalls = message.parts.flatMap((part) =>
            part.type === 'tool-call' ? [part.toolCall] : []
        );

        return {
            role: 'assistant',
            content: text.length > 0 ? text : null,
            ...(toolCalls.length > 0
                ? {
                      tool_calls: toolCalls.map((toolCall) => ({
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

export function createGenerateRequest(
    modelId: string,
    options: GenerateOptions
) {
    return createRequest(modelId, options, false);
}

export function createStreamRequest(modelId: string, options: GenerateOptions) {
    return createRequest(modelId, options, true);
}

function createRequest(
    modelId: string,
    options: GenerateOptions,
    stream: boolean
) {
    const openaiOptions = parseOpenAIChatGenerateProviderOptions(
        options.providerOptions
    );
    return {
        ...createRequestBase(modelId, options),
        ...(stream
            ? {
                  stream: true as const,
                  stream_options: {
                      include_usage: true,
                  },
              }
            : {}),
        ...mapOpenAIProviderOptionsToRequestFields(openaiOptions),
    };
}

function createRequestBase(modelId: string, options: GenerateOptions) {
    validateOpenAIReasoningConfig(modelId, options);

    const reasoningFields = mapReasoningToRequestFields(modelId, options);

    return {
        model: modelId,
        messages: convertMessages(options.messages),
        ...(options.tools && Object.keys(options.tools).length > 0
            ? { tools: convertTools(options.tools) }
            : {}),
        ...(options.toolChoice
            ? { tool_choice: convertToolChoice(options.toolChoice) }
            : {}),
        ...reasoningFields,
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
            ? { max_tokens: options.maxTokens }
            : {}),
        ...(options.topP !== undefined ? { top_p: options.topP } : {}),
    };
}

function mapOpenAIProviderOptionsToRequestFields(
    options: OpenAIChatGenerateProviderOptions | undefined
) {
    return {
        ...(options?.store !== undefined ? { store: options.store } : {}),
        ...(options?.serviceTier !== undefined
            ? { service_tier: options.serviceTier }
            : {}),
        ...(options?.parallelToolCalls !== undefined
            ? { parallel_tool_calls: options.parallelToolCalls }
            : {}),
        ...(options?.user !== undefined ? { user: options.user } : {}),
        ...(options?.stopSequences ? { stop: options.stopSequences } : {}),
        ...(options?.frequencyPenalty !== undefined
            ? { frequency_penalty: options.frequencyPenalty }
            : {}),
        ...(options?.presencePenalty !== undefined
            ? { presence_penalty: options.presencePenalty }
            : {}),
        ...(options?.seed !== undefined ? { seed: options.seed } : {}),
    };
}

export function mapGenerateResponse(
    response: ChatCompletion,
    adapterOptions: OpenAIChatCompletionsAdapterOptions = {}
): GenerateResult {
    const firstChoice = response.choices[0];

    if (!firstChoice) {
        return {
            parts: [],
            content: null,
            reasoning: null,
            toolCalls: [],
            finishReason: 'unknown',
            usage: {
                inputTokens: 0,
                outputTokens: 0,
                inputTokenDetails: {
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                },
                outputTokenDetails: {},
            },
        };
    }

    const reasoningTokens =
        response.usage?.completion_tokens_details?.reasoning_tokens;
    const content = extractTextContent(firstChoice.message.content);
    const reasoning = adapterOptions.compatibility
        ? (extractCompatibleReasoningText(firstChoice.message) ?? null)
        : null;
    const toolCalls = parseToolCalls(firstChoice.message.tool_calls);
    const parts = createAssistantParts(reasoning, content, toolCalls);

    return {
        parts,
        content,
        reasoning,
        toolCalls,
        finishReason: mapFinishReason(firstChoice.finish_reason),
        usage: {
            inputTokens: response.usage?.prompt_tokens ?? 0,
            outputTokens: response.usage?.completion_tokens ?? 0,
            inputTokenDetails: {
                cacheReadTokens:
                    response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
                cacheWriteTokens: 0,
            },
            outputTokenDetails: {
                ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
            },
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
    stream: AsyncIterable<ChatCompletionChunk>,
    adapterOptions: OpenAIChatCompletionsAdapterOptions = {}
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
    let textOpen = false;
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
    const startReasoning = function* (): Iterable<StreamEvent> {
        if (reasoningOpen) {
            return;
        }

        reasoningOpen = true;
        yield { type: 'reasoning-start' };
    };
    const closeReasoning = function* (): Iterable<StreamEvent> {
        if (!reasoningOpen) {
            return;
        }

        reasoningOpen = false;
        yield { type: 'reasoning-end' };
    };

    for await (const chunk of stream) {
        if (chunk.usage) {
            const reasoningTokens =
                chunk.usage.completion_tokens_details?.reasoning_tokens;
            usage = {
                inputTokens: chunk.usage.prompt_tokens ?? 0,
                outputTokens: chunk.usage.completion_tokens ?? 0,
                inputTokenDetails: {
                    cacheReadTokens:
                        chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
                    cacheWriteTokens: 0,
                },
                outputTokenDetails: {
                    ...(reasoningTokens !== undefined
                        ? { reasoningTokens }
                        : {}),
                },
            };
        }

        const choice = chunk.choices[0];
        if (!choice) {
            continue;
        }

        const reasoningDelta = adapterOptions.compatibility
            ? extractCompatibleReasoningText(choice.delta)
            : undefined;
        if (reasoningDelta !== undefined) {
            yield* closeText();
            yield* startReasoning();
            yield {
                type: 'reasoning-delta',
                text: reasoningDelta,
            };
        }

        if (choice.delta.content) {
            yield* closeReasoning();
            yield* startText();
            yield {
                type: 'text-delta',
                text: choice.delta.content,
            };
        }

        if (choice.delta.tool_calls) {
            yield* closeReasoning();
            yield* closeText();
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
            yield* closeReasoning();
            yield* closeText();
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

    yield* closeReasoning();
    yield* closeText();

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

    const clampedEffort = clampReasoningEffort(
        options.reasoning.effort,
        capabilities.reasoning.supportedEfforts
    );

    return {
        reasoning_effort: toOpenAIReasoningEffort(clampedEffort),
    };
}

function createAssistantParts(
    reasoning: string | null,
    content: string | null,
    toolCalls: ToolCall[]
): AssistantContentPart[] {
    const parts: AssistantContentPart[] = [];

    if (reasoning) {
        parts.push({
            type: 'reasoning',
            text: reasoning,
        });
    }
    if (content) {
        parts.push({
            type: 'text',
            text: content,
        });
    }
    for (const toolCall of toolCalls) {
        parts.push({
            type: 'tool-call',
            toolCall,
        });
    }

    return parts;
}

function extractTextContent(content: unknown): string | null {
    if (typeof content === 'string') {
        return content;
    }
    if (!Array.isArray(content)) {
        return null;
    }

    const text = content
        .flatMap((item) => {
            if (!item || typeof item !== 'object') {
                return [];
            }
            const textValue = (item as { text?: unknown }).text;
            return typeof textValue === 'string' ? [textValue] : [];
        })
        .join('');

    return text.length > 0 ? text : null;
}
