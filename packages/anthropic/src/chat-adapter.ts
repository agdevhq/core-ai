import { APIError } from '@anthropic-ai/sdk';
import type {
    Message as AnthropicMessage,
    RawMessageStreamEvent,
    StopReason,
    ToolUseBlock,
    ContentBlockParam,
    MessageParam,
    Tool,
    ToolChoice,
    ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages/messages';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ProviderError } from '@core-ai/core-ai';
import type {
    FinishReason,
    GenerateObjectOptions,
    GenerateOptions,
    GenerateResult,
    Message,
    StreamEvent,
    ToolCall,
    ToolSet,
    UserContentPart,
    ToolChoice as AgToolChoice,
} from '@core-ai/core-ai';

const UNSUPPORTED_ANTHROPIC_SCHEMA_KEYWORDS = new Set([
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
    'minLength',
    'maxLength',
    'maxItems',
]);

export type ConvertedAnthropicMessages = {
    system: string | undefined;
    messages: MessageParam[];
};

export function convertMessages(
    messages: Message[]
): ConvertedAnthropicMessages {
    const systemParts: string[] = [];
    const convertedMessages: MessageParam[] = [];
    let previousInputWasTool = false;

    for (const message of messages) {
        if (message.role === 'system') {
            systemParts.push(message.content);
            previousInputWasTool = false;
            continue;
        }

        if (message.role === 'user') {
            convertedMessages.push({
                role: 'user',
                content:
                    typeof message.content === 'string'
                        ? message.content
                        : message.content.map(convertUserContentPart),
            });
            previousInputWasTool = false;
            continue;
        }

        if (message.role === 'assistant') {
            const contentBlocks: ContentBlockParam[] = [];

            if (message.content) {
                contentBlocks.push({
                    type: 'text',
                    text: message.content,
                });
            }

            for (const toolCall of message.toolCalls ?? []) {
                contentBlocks.push({
                    type: 'tool_use',
                    id: toolCall.id,
                    name: toolCall.name,
                    input: toolCall.arguments,
                });
            }

            convertedMessages.push({
                role: 'assistant',
                content:
                    contentBlocks.length === 0
                        ? ''
                        : contentBlocks.length === 1 &&
                            contentBlocks[0]?.type === 'text'
                          ? contentBlocks[0].text
                          : contentBlocks,
            });
            previousInputWasTool = false;
            continue;
        }

        const toolResultBlock: ToolResultBlockParam = {
            type: 'tool_result',
            tool_use_id: message.toolCallId,
            content: message.content,
            ...(message.isError ? { is_error: true } : {}),
        };

        if (
            previousInputWasTool &&
            convertedMessages.at(-1)?.role === 'user' &&
            Array.isArray(convertedMessages.at(-1)?.content)
        ) {
            const lastMessage = convertedMessages.at(-1);
            if (lastMessage && Array.isArray(lastMessage.content)) {
                lastMessage.content.push(toolResultBlock);
            }
        } else {
            convertedMessages.push({
                role: 'user',
                content: [toolResultBlock],
            });
        }

        previousInputWasTool = true;
    }

    return {
        system: systemParts.length > 0 ? systemParts.join('\n') : undefined,
        messages: convertedMessages,
    };
}

function convertUserContentPart(part: UserContentPart): ContentBlockParam {
    if (part.type === 'text') {
        return {
            type: 'text',
            text: part.text,
        };
    }

    if (part.type === 'image') {
        if (part.source.type === 'url') {
            return {
                type: 'image',
                source: {
                    type: 'url',
                    url: part.source.url,
                },
            };
        }

        return {
            type: 'image',
            source: {
                type: 'base64',
                media_type: part.source.mediaType as
                    | 'image/jpeg'
                    | 'image/png'
                    | 'image/gif'
                    | 'image/webp',
                data: part.source.data,
            },
        };
    }

    if (part.mimeType !== 'application/pdf') {
        throw new Error(
            'Anthropic only supports PDF file content in this abstraction'
        );
    }

    return {
        type: 'document',
        source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: part.data,
        },
    };
}

export function convertTools(tools: ToolSet): Tool[] {
    return Object.values(tools).map((tool) => {
        const schema = toAnthropicJsonSchema(tool.parameters);

        return {
            name: tool.name,
            description: tool.description,
            input_schema: schema as Tool['input_schema'],
            strict: true,
        };
    });
}

export function convertToolChoice(choice: AgToolChoice): ToolChoice {
    if (choice === 'auto') {
        return { type: 'auto' };
    }
    if (choice === 'none') {
        return { type: 'none' };
    }
    if (choice === 'required') {
        return { type: 'any' };
    }
    return {
        type: 'tool',
        name: choice.toolName,
    };
}

export function createStructuredOutputOptions<TSchema extends z.ZodType>(
    options: GenerateObjectOptions<TSchema>
): GenerateOptions {
    const schema = toAnthropicJsonSchema(options.schema);
    const schemaDescription = options.schemaDescription?.trim();
    if (schemaDescription && schemaDescription.length > 0) {
        schema.description = schemaDescription;
    }

    return {
        messages: options.messages,
        config: options.config,
        providerOptions: {
            ...(options.providerOptions ?? {}),
            output_config: {
                format: {
                    type: 'json_schema',
                    schema,
                },
            },
        },
        signal: options.signal,
    };
}

function toAnthropicJsonSchema(schema: z.ZodType): Record<string, unknown> {
    const rawSchema = zodToJsonSchema(schema) as Record<string, unknown>;
    return normalizeAnthropicJsonSchema(rawSchema);
}

function normalizeAnthropicJsonSchema(value: unknown): Record<string, unknown> {
    const normalized = normalizeAnthropicJsonValue(value);
    return isJsonObject(normalized) ? normalized : {};
}

function normalizeAnthropicJsonValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(normalizeAnthropicJsonValue);
    }

    if (!isJsonObject(value)) {
        return value;
    }

    const normalized: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(value)) {
        if (
            key === '$schema' ||
            UNSUPPORTED_ANTHROPIC_SCHEMA_KEYWORDS.has(key) ||
            (key === 'minItems' && typeof child === 'number' && child > 1)
        ) {
            continue;
        }
        normalized[key] = normalizeAnthropicJsonValue(child);
    }

    if (isObjectSchema(normalized)) {
        normalized.additionalProperties = false;
    }

    return normalized;
}

function isObjectSchema(value: Record<string, unknown>): boolean {
    return (
        value.type === 'object' ||
        Object.hasOwn(value, 'properties') ||
        Object.hasOwn(value, 'required')
    );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createGenerateRequest(
    modelId: string,
    defaultMaxTokens: number,
    options: GenerateOptions
) {
    return {
        ...createRequestBase(modelId, defaultMaxTokens, options),
        ...options.providerOptions,
    };
}

export function createStreamRequest(
    modelId: string,
    defaultMaxTokens: number,
    options: GenerateOptions
) {
    return {
        ...createRequestBase(modelId, defaultMaxTokens, options),
        stream: true as const,
        ...options.providerOptions,
    };
}

function createRequestBase(
    modelId: string,
    defaultMaxTokens: number,
    options: GenerateOptions
) {
    const converted = convertMessages(options.messages);

    return {
        model: modelId,
        messages: converted.messages,
        max_tokens: options.config?.maxTokens ?? defaultMaxTokens,
        ...(converted.system ? { system: converted.system } : {}),
        ...(options.tools && Object.keys(options.tools).length > 0
            ? { tools: convertTools(options.tools) }
            : {}),
        ...(options.toolChoice
            ? { tool_choice: convertToolChoice(options.toolChoice) }
            : {}),
        ...mapConfigToRequestFields(options.config),
    };
}

function mapConfigToRequestFields(config: GenerateOptions['config']) {
    return {
        ...(config?.temperature !== undefined
            ? { temperature: config.temperature }
            : {}),
        ...(config?.topP !== undefined ? { top_p: config.topP } : {}),
        ...(config?.stopSequences
            ? { stop_sequences: config.stopSequences }
            : {}),
    };
}

export function mapGenerateResponse(
    response: AnthropicMessage
): GenerateResult {
    const toolCalls: ToolCall[] = [];
    let content = '';

    for (const block of response.content) {
        if (block.type === 'text') {
            content += block.text;
            continue;
        }
        if (block.type === 'tool_use') {
            toolCalls.push({
                id: block.id,
                name: block.name,
                arguments: asObject(block.input),
            });
        }
    }

    const cacheReadTokens = response.usage.cache_read_input_tokens ?? 0;
    const cacheWriteTokens = response.usage.cache_creation_input_tokens ?? 0;
    const inputTokens =
        response.usage.input_tokens + cacheReadTokens + cacheWriteTokens;

    return {
        content: content.length > 0 ? content : null,
        toolCalls,
        finishReason: mapStopReason(response.stop_reason),
        usage: {
            inputTokens,
            outputTokens: response.usage.output_tokens,
            inputTokenDetails: {
                cacheReadTokens,
                cacheWriteTokens,
            },
            outputTokenDetails: {
                reasoningTokens: 0,
            },
        },
    };
}

export async function* transformStream(
    stream: AsyncIterable<RawMessageStreamEvent>
): AsyncIterable<StreamEvent> {
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

    const toolBuffers = new Map<
        number,
        { id: string; name: string; arguments: string }
    >();
    const emittedToolCalls = new Set<number>();

    for await (const event of stream) {
        if (event.type === 'message_start') {
            const cacheReadTokens =
                event.message.usage.cache_read_input_tokens ?? 0;
            const cacheWriteTokens =
                event.message.usage.cache_creation_input_tokens ?? 0;
            const inputTokens =
                event.message.usage.input_tokens +
                cacheReadTokens +
                cacheWriteTokens;
            usage = {
                inputTokens,
                outputTokens: event.message.usage.output_tokens,
                inputTokenDetails: {
                    cacheReadTokens,
                    cacheWriteTokens,
                },
                outputTokenDetails: {
                    reasoningTokens: 0,
                },
            };
            continue;
        }

        if (event.type === 'content_block_start') {
            if (event.content_block.type === 'tool_use') {
                const block = event.content_block as ToolUseBlock;
                const initialArguments =
                    block.input && typeof block.input === 'object'
                        ? Object.keys(block.input).length > 0
                            ? JSON.stringify(block.input)
                            : ''
                        : '';

                toolBuffers.set(event.index, {
                    id: block.id,
                    name: block.name,
                    arguments: initialArguments,
                });

                yield {
                    type: 'tool-call-start',
                    toolCallId: block.id,
                    toolName: block.name,
                };
            }
            continue;
        }

        if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
                yield {
                    type: 'content-delta',
                    text: event.delta.text,
                };
                continue;
            }

            if (event.delta.type === 'input_json_delta') {
                const current = toolBuffers.get(event.index);
                if (!current) {
                    continue;
                }

                current.arguments += event.delta.partial_json;
                yield {
                    type: 'tool-call-delta',
                    toolCallId: current.id,
                    argumentsDelta: event.delta.partial_json,
                };
            }
            continue;
        }

        if (event.type === 'content_block_stop') {
            const current = toolBuffers.get(event.index);
            if (!current || emittedToolCalls.has(event.index)) {
                continue;
            }

            emittedToolCalls.add(event.index);
            yield {
                type: 'tool-call-end',
                toolCall: {
                    id: current.id,
                    name: current.name,
                    arguments: safeParseJsonObject(current.arguments),
                },
            };
            continue;
        }

        if (event.type === 'message_delta') {
            finishReason = mapStopReason(event.delta.stop_reason);
            const nonCachedInputTokens =
                event.usage.input_tokens ??
                usage.inputTokens -
                    usage.inputTokenDetails.cacheReadTokens -
                    usage.inputTokenDetails.cacheWriteTokens;
            const cacheReadTokens =
                event.usage.cache_read_input_tokens ??
                usage.inputTokenDetails.cacheReadTokens;
            const cacheWriteTokens =
                event.usage.cache_creation_input_tokens ??
                usage.inputTokenDetails.cacheWriteTokens;
            usage = {
                inputTokens:
                    nonCachedInputTokens + cacheReadTokens + cacheWriteTokens,
                outputTokens: event.usage.output_tokens,
                inputTokenDetails: {
                    cacheReadTokens,
                    cacheWriteTokens,
                },
                outputTokenDetails: {
                    reasoningTokens: 0,
                },
            };
            continue;
        }
    }

    yield {
        type: 'finish',
        finishReason,
        usage,
    };
}

function mapStopReason(reason: StopReason | null): FinishReason {
    if (reason === 'end_turn' || reason === 'stop_sequence') {
        return 'stop';
    }
    if (reason === 'max_tokens') {
        return 'length';
    }
    if (reason === 'tool_use') {
        return 'tool-calls';
    }
    if (reason === 'refusal') {
        return 'content-filter';
    }
    return 'unknown';
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

export function wrapError(error: unknown): ProviderError {
    if (error instanceof APIError) {
        return new ProviderError(
            error.message,
            'anthropic',
            error.status,
            error
        );
    }

    return new ProviderError(
        error instanceof Error ? error.message : String(error),
        'anthropic',
        undefined,
        error
    );
}
