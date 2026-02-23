import { APIError } from '@anthropic-ai/sdk';
import type Anthropic from '@anthropic-ai/sdk';
import type {
    Message,
    RawMessageStreamEvent,
    StopReason,
    ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages/messages';
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

type AnthropicMessagesClient = {
    messages: Anthropic['messages'];
};

export function createAnthropicChatModel(
    client: AnthropicMessagesClient,
    modelId: string,
    defaultMaxTokens: number
): ChatModel {
    return {
        provider: 'anthropic',
        modelId,
        async generate(options: GenerateOptions): Promise<GenerateResult> {
            try {
                const converted = convertMessages(options.messages);
                const request = {
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

                const response = (await client.messages.create(
                    request as never
                )) as Message;

                return mapGenerateResponse(response);
            } catch (error) {
                throw wrapError(error);
            }
        },
        async stream(options: GenerateOptions): Promise<StreamResult> {
            try {
                const converted = convertMessages(options.messages);
                const request = {
                    model: modelId,
                    messages: converted.messages,
                    stream: true,
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

                const stream = (await client.messages.create(
                    request as never
                )) as unknown as AsyncIterable<RawMessageStreamEvent>;

                return createStreamResult(transformStream(stream));
            } catch (error) {
                throw wrapError(error);
            }
        },
    };
}

function mapGenerateResponse(response: Message): GenerateResult {
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
            totalTokens:
                response.usage.input_tokens + response.usage.output_tokens,
        },
    };
}

async function* transformStream(
    stream: AsyncIterable<RawMessageStreamEvent>
): AsyncIterable<StreamEvent> {
    let finishReason: FinishReason = 'unknown';
    let usage = {
        inputTokens: 0,
        outputTokens: 0,
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
                totalTokens:
                    event.message.usage.input_tokens +
                    event.message.usage.output_tokens,
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

function wrapError(error: unknown): ProviderError {
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
