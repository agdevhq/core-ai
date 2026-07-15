import type {
    ChatCompletion,
    ChatCompletionChunk,
    ChatCompletionContentPart,
    ChatCompletionMessageFunctionToolCall,
} from 'openai/resources/chat/completions/completions';
import type { z } from 'zod';
import type {
    AssistantContentPart,
    AssistantMessage,
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
    getProviderMetadata,
    safeParseJsonObject,
    ValidationError,
    zodSchemaToJsonSchema,
} from '@core-ai/core-ai';
import {
    isReasoningModel,
    supportsNativeStructuredOutput,
    supportsReasoningEffort,
    toXAIReasoningEffort,
} from './model-capabilities.ts';
import {
    parseXAIGenerateProviderOptions,
    type XAIGenerateProviderOptions,
} from './provider-options.ts';

export const DEFAULT_STRUCTURED_OUTPUT_TOOL_NAME = 'core_ai_generate_object';
export const DEFAULT_STRUCTURED_OUTPUT_TOOL_DESCRIPTION =
    'Return a JSON object that matches the requested schema.';

type XAIChatCompletionMessageParam =
    | { role: 'system'; content: string }
    | {
          role: 'user';
          content: string | ChatCompletionContentPart[];
      }
    | {
          role: 'assistant';
          content: string | null;
          reasoning_content?: string;
          tool_calls?: Array<{
              id: string;
              type: 'function';
              function: { name: string; arguments: string };
          }>;
      }
    | { role: 'tool'; tool_call_id: string; content: string };

export function convertMessages(messages: Message[]): XAIChatCompletionMessageParam[] {
    return messages.map(convertMessage);
}

function convertMessage(message: Message): XAIChatCompletionMessageParam {
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
        return convertAssistantMessage(message);
    }

    return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: message.content,
    };
}

function convertAssistantMessage(
    message: AssistantMessage
): XAIChatCompletionMessageParam {
    const reasoningParts: string[] = [];
    const fallbackThinkingParts: string[] = [];
    const textParts: string[] = [];
    const toolCalls = message.parts.flatMap((part) =>
        part.type === 'tool-call' ? [part.toolCall] : []
    );

    for (const part of message.parts) {
        if (part.type === 'text') {
            textParts.push(part.text);
            continue;
        }

        if (part.type === 'reasoning' && part.text.length > 0) {
            if (getProviderMetadata(part.providerMetadata, 'xai')) {
                reasoningParts.push(part.text);
            } else {
                fallbackThinkingParts.push(part.text);
            }
        }
    }

    const reasoningContent = reasoningParts.join('\n\n');
    const fallbackText = fallbackThinkingParts
        .map((text) => `<thinking>${text}</thinking>`)
        .join('\n\n');
    const contentParts = [
        ...(fallbackText.length > 0 ? [fallbackText] : []),
        ...textParts,
    ];
    const content = contentParts.join('\n\n');

    return {
        role: 'assistant',
        ...(reasoningContent.length > 0
            ? { reasoning_content: reasoningContent }
            : {}),
        content: content.length > 0 ? content : null,
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

export function convertTools(tools: ToolSet) {
    return Object.values(tools).map((tool) => ({
        type: 'function' as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters: zodSchemaToJsonSchema(tool.parameters),
        },
    }));
}

export function convertToolChoice(choice: ToolChoice) {
    if (typeof choice === 'string') {
        return choice;
    }

    return {
        type: 'function' as const,
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
    modelId: string,
    options: GenerateObjectOptions<TSchema>
): GenerateOptions {
    const nativeStructuredOutput =
        supportsNativeStructuredOutput(modelId);

    return {
        messages: nativeStructuredOutput
            ? options.messages
            : [createStructuredOutputInstruction(options), ...options.messages],
        reasoning: options.reasoning,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        topP: options.topP,
        providerOptions: {
            ...options.providerOptions,
            xai: {
                ...options.providerOptions?.xai,
                responseFormat: nativeStructuredOutput
                    ? {
                          type: 'json_schema',
                          json_schema: {
                              name: getStructuredOutputToolName(options),
                              ...(options.schemaDescription
                                  ? {
                                        description:
                                            options.schemaDescription,
                                    }
                                  : {}),
                              strict: true,
                              schema: zodSchemaToJsonSchema(options.schema),
                          },
                      }
                    : { type: 'json_object' },
            },
        },
        signal: options.signal,
    };
}

function createStructuredOutputInstruction<TSchema extends z.ZodType>(
    options: GenerateObjectOptions<TSchema>
): Message {
    const schemaName = getStructuredOutputToolName(options);
    const schemaDescription =
        options.schemaDescription ?? DEFAULT_STRUCTURED_OUTPUT_TOOL_DESCRIPTION;
    const jsonSchema = zodSchemaToJsonSchema(options.schema);

    return {
        role: 'system',
        content: [
            'Return only a valid JSON object.',
            `Schema name: ${schemaName}.`,
            `Description: ${schemaDescription}`,
            `JSON Schema: ${JSON.stringify(jsonSchema)}`,
            'Do not include markdown, prose, or any text outside the JSON object.',
        ].join('\n'),
    };
}

export function validateXAIGenerateOptions(
    modelId: string,
    options: GenerateOptions
): void {
    if (!isReasoningModel(modelId)) {
        return;
    }

    const xaiOptions = parseXAIGenerateProviderOptions(options.providerOptions);
    const restrictedFields = [
        { name: 'stopSequences', value: xaiOptions?.stopSequences },
        {
            name: 'frequencyPenalty',
            value: xaiOptions?.frequencyPenalty,
        },
        {
            name: 'presencePenalty',
            value: xaiOptions?.presencePenalty,
        },
    ] as const;

    for (const { name, value } of restrictedFields) {
        if (value === undefined) {
            continue;
        }

        if (Array.isArray(value) && value.length === 0) {
            continue;
        }

        throw new ValidationError(
            `xAI reasoning model "${modelId}" does not support providerOptions.xai.${name}`,
            undefined,
            'xai'
        );
    }
}

export function createGenerateRequest(modelId: string, options: GenerateOptions) {
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
    validateXAIGenerateOptions(modelId, options);

    const xaiOptions = parseXAIGenerateProviderOptions(options.providerOptions);

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
        ...mapXAIProviderOptionsToRequestFields(modelId, xaiOptions),
    };
}

function createRequestBase(modelId: string, options: GenerateOptions) {
    return {
        model: modelId,
        messages: convertMessages(options.messages),
        ...(options.tools && Object.keys(options.tools).length > 0
            ? { tools: convertTools(options.tools) }
            : {}),
        ...(options.toolChoice
            ? { tool_choice: convertToolChoice(options.toolChoice) }
            : {}),
        ...mapReasoningToRequestFields(modelId, options),
        ...mapSamplingToRequestFields(options),
    };
}

function mapReasoningToRequestFields(
    modelId: string,
    options: Pick<GenerateOptions, 'reasoning'>
) {
    if (!options.reasoning || !supportsReasoningEffort(modelId)) {
        return {};
    }

    return {
        reasoning_effort: toXAIReasoningEffort(options.reasoning.effort),
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

function mapXAIProviderOptionsToRequestFields(
    modelId: string,
    options: XAIGenerateProviderOptions | undefined
) {
    const reasoningModel = isReasoningModel(modelId);

    return {
        ...(options?.parallelToolCalls !== undefined
            ? { parallel_tool_calls: options.parallelToolCalls }
            : {}),
        ...(options?.responseFormat !== undefined
            ? { response_format: options.responseFormat }
            : {}),
        ...(options?.user !== undefined ? { user: options.user } : {}),
        ...(!reasoningModel && options?.stopSequences
            ? { stop: options.stopSequences }
            : {}),
        ...(!reasoningModel && options?.frequencyPenalty !== undefined
            ? { frequency_penalty: options.frequencyPenalty }
            : {}),
        ...(!reasoningModel && options?.presencePenalty !== undefined
            ? { presence_penalty: options.presencePenalty }
            : {}),
        ...(options?.seed !== undefined ? { seed: options.seed } : {}),
        ...(options?.serviceTier !== undefined
            ? { service_tier: options.serviceTier }
            : {}),
        ...(options?.promptCacheKey !== undefined
            ? { prompt_cache_key: options.promptCacheKey }
            : {}),
    };
}

export function mapGenerateResponse(response: ChatCompletion): GenerateResult {
    const firstChoice = response.choices[0];

    if (!firstChoice) {
        return emptyGenerateResult();
    }

    const reasoningContent = getReasoningContent(firstChoice.message);
    const content = extractTextContent(firstChoice.message.content);
    const toolCalls = parseToolCalls(firstChoice.message.tool_calls);
    const parts = createAssistantParts(reasoningContent, content, toolCalls);

    return {
        parts,
        content,
        reasoning: reasoningContent,
        toolCalls,
        finishReason: mapFinishReason(firstChoice.finish_reason),
        usage: mapXAIUsage(response.usage),
    };
}

function mapXAIUsage(
    usage: ChatCompletion['usage'] | ChatCompletionChunk['usage'] | undefined
): GenerateResult['usage'] {
    const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens;
    const completionTokens = usage?.completion_tokens ?? 0;

    // xAI reports completion_tokens as visible output only; reasoning tokens
    // are billed separately and must be included in total output accounting.
    const outputTokens =
        reasoningTokens !== undefined
            ? completionTokens + reasoningTokens
            : completionTokens;

    return {
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens,
        inputTokenDetails: {
            cacheReadTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
            cacheWriteTokens: 0,
        },
        outputTokenDetails: {
            ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
        },
    };
}

function emptyGenerateResult(): GenerateResult {
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

function getReasoningContent(message: unknown): string | null {
    if (!message || typeof message !== 'object') {
        return null;
    }

    const value = (message as { reasoning_content?: unknown }).reasoning_content;
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function getDeltaReasoningContent(delta: unknown): string | null {
    if (!delta || typeof delta !== 'object') {
        return null;
    }

    const value = (delta as { reasoning_content?: unknown }).reasoning_content;
    return typeof value === 'string' && value.length > 0 ? value : null;
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
    let reasoningOpen = false;
    let textOpen = false;
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
            providerMetadata: { xai: {} },
        };
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

    for await (const chunk of stream) {
        if (chunk.usage) {
            usage = mapXAIUsage(chunk.usage);
        }

        const choice = chunk.choices[0];
        if (!choice) {
            continue;
        }

        const reasoningDelta = getDeltaReasoningContent(choice.delta);
        if (reasoningDelta) {
            yield* closeText();
            if (!reasoningOpen) {
                reasoningOpen = true;
                yield { type: 'reasoning-start' };
            }
            yield {
                type: 'reasoning-delta',
                text: reasoningDelta,
            };
        }

        if (choice.delta.content) {
            const reasoningEnd = closeReasoning();
            if (reasoningEnd) {
                yield reasoningEnd;
            }
            yield* startText();
            yield {
                type: 'text-delta',
                text: choice.delta.content,
            };
        }

        if (choice.delta.tool_calls) {
            const reasoningEnd = closeReasoning();
            if (reasoningEnd) {
                yield reasoningEnd;
            }
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

    const reasoningEnd = closeReasoning();
    if (reasoningEnd) {
        yield reasoningEnd;
    }
    yield* closeText();

    yield {
        type: 'finish',
        finishReason,
        usage,
    };
}

function createAssistantParts(
    reasoningContent: string | null,
    content: string | null,
    toolCalls: ToolCall[]
): AssistantContentPart[] {
    const parts: AssistantContentPart[] = [];

    if (reasoningContent) {
        parts.push({
            type: 'reasoning',
            text: reasoningContent,
            providerMetadata: { xai: {} },
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
        return content.length > 0 ? content : null;
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
