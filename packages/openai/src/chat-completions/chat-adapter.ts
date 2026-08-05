import type {
    ChatCompletion,
    ChatCompletionChunk,
    ChatCompletionContentPart,
    ChatCompletionAssistantMessageParam,
    ChatCompletionMessageFunctionToolCall,
    ChatCompletionMessageParam,
} from 'openai/resources/chat/completions/completions';
import type {
    AssistantContentPart,
    FinishReason,
    GenerateOptions,
    GenerateResult,
    Message,
    ModelCapabilities,
    StreamEvent,
    ToolCall,
    UserContentPart,
} from '@core-ai/core-ai';
import {
    clampReasoningEffort,
    getProviderMetadata,
    validateImageInput,
} from '@core-ai/core-ai';
import {
    getOpenAIModelCapabilities,
    type OpenAIChatCompletionsCapabilities,
    toOpenAIReasoningEffort,
} from '../model-capabilities.js';
import { convertToolChoice, convertTools } from '../shared/tools.js';
import type { OpenAIResolvedReasoningCompatibilityOptions } from '../shared/compatibility-options.js';
import type { OpenAIRequestOptions } from '../shared/structured-output.js';
import {
    safeParseJsonObject,
    validateOpenAIReasoningConfig,
    validateReasoningConfig,
} from '../shared/utils.js';
import {
    parseOpenAIChatGenerateProviderOptions,
    type OpenAIChatGenerateProviderOptions,
    type OpenAIChatGenerateProviderOptionsConfig,
} from '../provider-options.js';
import { extractCompatibleReasoningText } from './compatibility.js';

export type OpenAIChatCompletionsAdapterOptions = {
    capabilities?: ModelCapabilities;
    compatibility?: boolean;
    maxTokensParameter?: OpenAIChatCompletionsCapabilities['maxTokensParameter'];
    providerId?: string;
    providerOptions?: OpenAIChatGenerateProviderOptionsConfig;
    reasoning?: OpenAIResolvedReasoningCompatibilityOptions;
};

type OpenAIChatCompletionsRequestAdapterOptions =
    OpenAIChatCompletionsAdapterOptions & {
        capabilities: ModelCapabilities;
        providerId: string;
    };

export { convertToolChoice, convertTools, validateOpenAIReasoningConfig };

export function convertMessages(
    messages: Message[],
    adapterOptions: OpenAIChatCompletionsAdapterOptions = {}
): ChatCompletionMessageParam[] {
    return messages.map((message) => convertMessage(message, adapterOptions));
}

function convertMessage(
    message: Message,
    adapterOptions: OpenAIChatCompletionsAdapterOptions
): ChatCompletionMessageParam {
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
        const nativeReasoning: string[] = [];
        const text: string[] = [];
        for (const part of message.parts) {
            if (part.type === 'text') {
                text.push(part.text);
                continue;
            }
            if (part.type !== 'reasoning' || part.text.length === 0) {
                continue;
            }

            const reasoningOptions = adapterOptions.reasoning;
            if (
                reasoningOptions &&
                getProviderMetadata(
                    part.providerMetadata,
                    reasoningOptions.providerMetadataKey
                )
            ) {
                nativeReasoning.push(part.text);
            } else {
                text.push(`<thinking>${part.text}</thinking>`);
            }
        }
        const toolCalls = message.parts.flatMap((part) =>
            part.type === 'tool-call' ? [part.toolCall] : []
        );

        const assistantMessage: ChatCompletionAssistantMessageParam = {
            role: 'assistant',
            content: text.length > 0 ? text.join('\n\n') : null,
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

        if (adapterOptions.reasoning && nativeReasoning.length > 0) {
            return Object.assign(assistantMessage, {
                [adapterOptions.reasoning.requestField]:
                    nativeReasoning.join('\n\n'),
            });
        }

        return assistantMessage;
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
    options: GenerateOptions,
    adapterOptions: OpenAIChatCompletionsRequestAdapterOptions
) {
    return createRequest(modelId, options, false, adapterOptions);
}

export function createStreamRequest(
    modelId: string,
    options: GenerateOptions,
    adapterOptions: OpenAIChatCompletionsRequestAdapterOptions
) {
    return createRequest(modelId, options, true, adapterOptions);
}

function createRequest(
    modelId: string,
    options: OpenAIRequestOptions,
    stream: boolean,
    adapterOptions: OpenAIChatCompletionsRequestAdapterOptions
) {
    const openaiOptions = parseOpenAIChatGenerateProviderOptions(
        options.providerOptions,
        adapterOptions.providerOptions
    );
    return {
        ...createRequestBase(modelId, options, adapterOptions),
        ...(stream
            ? {
                  stream: true as const,
                  stream_options: {
                      include_usage: true,
                  },
              }
            : {}),
        ...mapOpenAIProviderOptionsToRequestFields(openaiOptions),
        ...mapResponseFormatToRequestFields(options.structuredOutputFormat),
    };
}

function createRequestBase(
    modelId: string,
    options: GenerateOptions,
    adapterOptions: OpenAIChatCompletionsRequestAdapterOptions
) {
    validateReasoningConfig(
        modelId,
        options,
        adapterOptions.capabilities,
        adapterOptions.providerId
    );
    validateImageInput({
        messages: options.messages,
        capabilities: adapterOptions.capabilities,
        modelId,
        providerId: adapterOptions.providerId,
    });

    const reasoningFields = mapReasoningToRequestFields(
        options,
        adapterOptions.capabilities
    );

    return {
        model: modelId,
        messages: convertMessages(options.messages, adapterOptions),
        ...(options.tools && Object.keys(options.tools).length > 0
            ? { tools: convertTools(options.tools) }
            : {}),
        ...(options.toolChoice
            ? { tool_choice: convertToolChoice(options.toolChoice) }
            : {}),
        ...reasoningFields,
        ...mapSamplingToRequestFields(modelId, options, adapterOptions),
    };
}

function mapSamplingToRequestFields(
    modelId: string,
    options: Pick<GenerateOptions, 'temperature' | 'maxTokens' | 'topP'>,
    adapterOptions: OpenAIChatCompletionsAdapterOptions
) {
    const maxTokensParameter =
        adapterOptions.maxTokensParameter ??
        getOpenAIModelCapabilities(modelId).chatCompletions.maxTokensParameter;

    return {
        ...(options.temperature !== undefined
            ? { temperature: options.temperature }
            : {}),
        ...(options.maxTokens !== undefined
            ? maxTokensParameter === 'max_completion_tokens'
                ? { max_completion_tokens: options.maxTokens }
                : { max_tokens: options.maxTokens }
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

function mapResponseFormatToRequestFields(
    format: OpenAIRequestOptions['structuredOutputFormat']
) {
    if (!format) {
        return {};
    }
    if (format.type === 'json_object') {
        return {
            response_format: {
                type: 'json_object' as const,
            },
        };
    }

    return {
        response_format: {
            type: 'json_schema' as const,
            json_schema: {
                name: format.name,
                ...(format.description
                    ? { description: format.description }
                    : {}),
                strict: format.strict,
                schema: format.schema,
            },
        },
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
    const parts = createAssistantParts(
        reasoning,
        content,
        toolCalls,
        adapterOptions.reasoning?.providerMetadataKey
    );

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
        yield {
            type: 'reasoning-end',
            ...(adapterOptions.reasoning
                ? {
                      providerMetadata: {
                          [adapterOptions.reasoning.providerMetadataKey]: {},
                      },
                  }
                : {}),
        };
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
    options: GenerateOptions,
    capabilities: ModelCapabilities
) {
    if (!options.reasoning) {
        return {};
    }

    if (
        capabilities.reasoning.mode === 'unsupported' ||
        capabilities.reasoning.supportedEfforts.length === 0
    ) {
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
    toolCalls: ToolCall[],
    reasoningProviderMetadataKey?: string
): AssistantContentPart[] {
    const parts: AssistantContentPart[] = [];

    if (reasoning) {
        parts.push({
            type: 'reasoning',
            text: reasoning,
            ...(reasoningProviderMetadataKey
                ? {
                      providerMetadata: {
                          [reasoningProviderMetadataKey]: {},
                      },
                  }
                : {}),
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
