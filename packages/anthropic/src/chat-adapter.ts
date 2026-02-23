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
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ProviderError } from '@core-ai/core-ai';
import type {
    FinishReason,
    GenerateOptions,
    GenerateResult,
    Message,
    StreamEvent,
    ToolCall,
    ToolSet,
    UserContentPart,
    ToolChoice as AgToolChoice,
} from '@core-ai/core-ai';

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
        const schema = zodToJsonSchema(tool.parameters) as Record<
            string,
            unknown
        >;
        const { $schema: _schema, ...inputSchema } = schema;

        return {
            name: tool.name,
            description: tool.description,
            input_schema: inputSchema as Tool['input_schema'],
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

export function createGenerateRequest(
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
        ...(options.config?.temperature !== undefined
            ? { temperature: options.config.temperature }
            : {}),
        ...(options.config?.topP !== undefined
            ? { top_p: options.config.topP }
            : {}),
        ...(options.config?.stopSequences
            ? { stop_sequences: options.config.stopSequences }
            : {}),
        ...options.providerOptions,
    };
}

export function createStreamRequest(
    modelId: string,
    defaultMaxTokens: number,
    options: GenerateOptions
) {
    const converted = convertMessages(options.messages);
    return {
        model: modelId,
        messages: converted.messages,
        stream: true as const,
        max_tokens: options.config?.maxTokens ?? defaultMaxTokens,
        ...(converted.system ? { system: converted.system } : {}),
        ...(options.tools && Object.keys(options.tools).length > 0
            ? { tools: convertTools(options.tools) }
            : {}),
        ...(options.toolChoice
            ? { tool_choice: convertToolChoice(options.toolChoice) }
            : {}),
        ...(options.config?.temperature !== undefined
            ? { temperature: options.config.temperature }
            : {}),
        ...(options.config?.topP !== undefined
            ? { top_p: options.config.topP }
            : {}),
        ...(options.config?.stopSequences
            ? { stop_sequences: options.config.stopSequences }
            : {}),
        ...options.providerOptions,
    };
}

export function mapGenerateResponse(response: AnthropicMessage): GenerateResult {
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

    return {
        content: content.length > 0 ? content : null,
        toolCalls,
        finishReason: mapStopReason(response.stop_reason),
        usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            reasoningTokens: 0,
            totalTokens: response.usage.input_tokens + response.usage.output_tokens,
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
        reasoningTokens: 0,
        totalTokens: 0,
    };

    const toolBuffers = new Map<
        number,
        { id: string; name: string; arguments: string }
    >();
    const emittedToolCalls = new Set<number>();

    for await (const event of stream) {
        if (event.type === 'message_start') {
            usage = {
                inputTokens: event.message.usage.input_tokens,
                outputTokens: event.message.usage.output_tokens,
                reasoningTokens: 0,
                totalTokens:
                    event.message.usage.input_tokens + event.message.usage.output_tokens,
            };
            continue;
        }

        if (event.type === 'content_block_start') {
            if (event.content_block.type === 'tool_use') {
                const block = event.content_block as ToolUseBlock;
                const initialArguments =
                    block.input && typeof block.input === 'object'
                        ? JSON.stringify(block.input)
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
            usage = {
                inputTokens: event.usage.input_tokens ?? usage.inputTokens,
                outputTokens: event.usage.output_tokens,
                reasoningTokens: 0,
                totalTokens:
                    (event.usage.input_tokens ?? usage.inputTokens) +
                    event.usage.output_tokens,
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
        return new ProviderError(error.message, 'anthropic', error.status, error);
    }

    return new ProviderError(
        error instanceof Error ? error.message : String(error),
        'anthropic',
        undefined,
        error
    );
}
