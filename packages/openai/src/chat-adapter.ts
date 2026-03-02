import type {
    ChatCompletion,
    ChatCompletionChunk,
    ChatCompletionContentPart,
    ChatCompletionMessageFunctionToolCall,
    ChatCompletionMessageParam,
    ChatCompletionTool,
    ChatCompletionToolChoiceOption,
} from 'openai/resources/chat/completions/completions';
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
    ToolChoice,
    ToolCall,
    ToolSet,
    UserContentPart,
} from '@core-ai/core-ai';
import { ProviderError } from '@core-ai/core-ai';
import {
    clampReasoningEffort,
    getOpenAIModelCapabilities,
    toOpenAIReasoningEffort,
} from './model-capabilities.js';

export const DEFAULT_STRUCTURED_OUTPUT_TOOL_NAME = 'core_ai_generate_object';
export const DEFAULT_STRUCTURED_OUTPUT_TOOL_DESCRIPTION =
    'Return a JSON object that matches the requested schema.';

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
            .flatMap((part) => (part.type === 'text' ? [part.text] : []))
            .join('');
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
        reasoning: options.reasoning,
        config: options.config,
        providerOptions: options.providerOptions,
        signal: options.signal,
    };
}

export function createGenerateRequest(
    modelId: string,
    options: GenerateOptions
) {
    return {
        ...createRequestBase(modelId, options),
        ...options.providerOptions,
    };
}

export function createStreamRequest(modelId: string, options: GenerateOptions) {
    return {
        ...createRequestBase(modelId, options),
        stream: true as const,
        stream_options: {
            include_usage: true,
        },
        ...options.providerOptions,
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
        ...mapConfigToRequestFields(options.config),
    };
}

function mapConfigToRequestFields(config: GenerateOptions['config']) {
    return {
        ...(config?.temperature !== undefined
            ? { temperature: config.temperature }
            : {}),
        ...(config?.maxTokens !== undefined ? { max_tokens: config.maxTokens } : {}),
        ...(config?.topP !== undefined ? { top_p: config.topP } : {}),
        ...(config?.stopSequences ? { stop: config.stopSequences } : {}),
        ...(config?.frequencyPenalty !== undefined
            ? { frequency_penalty: config.frequencyPenalty }
            : {}),
        ...(config?.presencePenalty !== undefined
            ? { presence_penalty: config.presencePenalty }
            : {}),
    };
}

export function mapGenerateResponse(response: ChatCompletion): GenerateResult {
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
                outputTokenDetails: {
                    reasoningTokens: 0,
                },
            },
        };
    }

    const reasoningTokens =
        response.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    const content = extractTextContent(firstChoice.message.content);
    const toolCalls = parseToolCalls(firstChoice.message.tool_calls);
    const parts = createAssistantParts(content, toolCalls);

    return {
        parts,
        content,
        reasoning: null,
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
                reasoningTokens,
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
        inputTokenDetails: {
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
        },
        outputTokenDetails: {
            reasoningTokens: 0,
        },
    };

    for await (const chunk of stream) {
        if (chunk.usage) {
            usage = {
                inputTokens: chunk.usage.prompt_tokens ?? 0,
                outputTokens: chunk.usage.completion_tokens ?? 0,
                inputTokenDetails: {
                    cacheReadTokens:
                        chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
                    cacheWriteTokens: 0,
                },
                outputTokenDetails: {
                    reasoningTokens:
                        chunk.usage.completion_tokens_details
                            ?.reasoning_tokens ?? 0,
                },
            };
        }

        const choice = chunk.choices[0];
        if (!choice) {
            continue;
        }

        if (choice.delta.content) {
            yield {
                type: 'text-delta',
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

function validateOpenAIReasoningConfig(
    modelId: string,
    options: GenerateOptions
): void {
    if (!options.reasoning) {
        return;
    }

    const capabilities = getOpenAIModelCapabilities(modelId);
    if (!capabilities.reasoning.restrictsSamplingParams) {
        return;
    }

    if (options.config?.temperature !== undefined) {
        throw new ProviderError(
            `OpenAI model "${modelId}" does not support temperature when reasoning is enabled`,
            'openai'
        );
    }

    if (options.config?.topP !== undefined) {
        throw new ProviderError(
            `OpenAI model "${modelId}" does not support topP when reasoning is enabled`,
            'openai'
        );
    }
}

function mapReasoningToRequestFields(modelId: string, options: GenerateOptions) {
    if (!options.reasoning) {
        return {};
    }

    const capabilities = getOpenAIModelCapabilities(modelId);
    if (!capabilities.reasoning.supportsEffort) {
        return {};
    }

    const clampedEffort = clampReasoningEffort(
        options.reasoning.effort,
        capabilities.reasoning.supportedRange
    );

    return {
        reasoning_effort: toOpenAIReasoningEffort(clampedEffort),
    };
}

function createAssistantParts(
    content: string | null,
    toolCalls: ToolCall[]
): AssistantContentPart[] {
    const parts: AssistantContentPart[] = [];

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

