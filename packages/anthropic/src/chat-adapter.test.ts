import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    ProviderError,
    defineTool,
    type Message,
    type ToolSet,
} from '@core-ai/core-ai';
import type {
    Message as AnthropicMessage,
    RawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/messages/messages';
import {
    createGenerateRequest,
    createStreamRequest,
    createStructuredOutputOptions,
    convertMessages,
    convertToolChoice,
    convertTools,
    mapGenerateResponse,
    transformStream,
} from './chat-adapter.js';
import { toAsyncIterable } from '@core-ai/testing';

describe('convertMessages', () => {
    it('should extract system messages separately', () => {
        const messages: Message[] = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
        ];

        const result = convertMessages(messages);

        expect(result.system).toBe('You are helpful.');
        expect(result.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('should concatenate multiple system messages', () => {
        const messages: Message[] = [
            { role: 'system', content: 'Rule 1.' },
            { role: 'system', content: 'Rule 2.' },
            { role: 'user', content: 'Hi' },
        ];

        const result = convertMessages(messages);

        expect(result.system).toBe('Rule 1.\nRule 2.');
    });

    it('should convert user image and pdf content', () => {
        const messages: Message[] = [
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Analyze these files' },
                    {
                        type: 'image',
                        source: {
                            type: 'url',
                            url: 'https://example.com/photo.jpg',
                        },
                    },
                    {
                        type: 'file',
                        data: 'base64-pdf-data',
                        mimeType: 'application/pdf',
                    },
                ],
            },
        ];

        const result = convertMessages(messages);

        expect(result.messages).toEqual([
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Analyze these files' },
                    {
                        type: 'image',
                        source: {
                            type: 'url',
                            url: 'https://example.com/photo.jpg',
                        },
                    },
                    {
                        type: 'document',
                        source: {
                            type: 'base64',
                            media_type: 'application/pdf',
                            data: 'base64-pdf-data',
                        },
                    },
                ],
            },
        ]);
    });

    it('should convert assistant tool calls to tool_use blocks', () => {
        const messages: Message[] = [
            { role: 'user', content: 'weather?' },
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'tool-call',
                        toolCall: {
                            id: 'tc_1',
                            name: 'search',
                            arguments: { query: 'weather' },
                        },
                    },
                ],
            },
        ];

        const result = convertMessages(messages);

        expect(result.messages[1]).toEqual({
            role: 'assistant',
            content: [
                {
                    type: 'tool_use',
                    id: 'tc_1',
                    name: 'search',
                    input: { query: 'weather' },
                },
            ],
        });
    });

    it('should convert tool results to user messages with tool_result blocks', () => {
        const messages: Message[] = [
            { role: 'user', content: 'weather?' },
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'tool-call',
                        toolCall: {
                            id: 'tc_1',
                            name: 'search',
                            arguments: { query: 'weather' },
                        },
                    },
                ],
            },
            {
                role: 'tool',
                toolCallId: 'tc_1',
                content: 'Sunny',
            },
        ];

        const result = convertMessages(messages);

        expect(result.messages[2]).toEqual({
            role: 'user',
            content: [
                {
                    type: 'tool_result',
                    tool_use_id: 'tc_1',
                    content: 'Sunny',
                },
            ],
        });
    });

    it('should merge consecutive tool results into one user message', () => {
        const messages: Message[] = [
            { role: 'user', content: 'do both' },
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'tool-call',
                        toolCall: { id: 'tc_1', name: 'a', arguments: {} },
                    },
                    {
                        type: 'tool-call',
                        toolCall: { id: 'tc_2', name: 'b', arguments: {} },
                    },
                ],
            },
            { role: 'tool', toolCallId: 'tc_1', content: 'result1' },
            { role: 'tool', toolCallId: 'tc_2', content: 'result2' },
        ];

        const result = convertMessages(messages);

        expect(result.messages[2]).toEqual({
            role: 'user',
            content: [
                {
                    type: 'tool_result',
                    tool_use_id: 'tc_1',
                    content: 'result1',
                },
                {
                    type: 'tool_result',
                    tool_use_id: 'tc_2',
                    content: 'result2',
                },
            ],
        });
        expect(result.messages).toHaveLength(3);
    });
});

describe('convertTools', () => {
    it('should convert tools to Anthropic format', () => {
        const tools: ToolSet = {
            search: defineTool({
                name: 'search',
                description: 'Search the web',
                parameters: z.object({ query: z.string() }),
            }),
        };

        const result = convertTools(tools);

        expect(result[0]?.name).toBe('search');
        expect(result[0]?.description).toBe('Search the web');
        expect(result[0]?.strict).toBe(true);
        expect(result[0]?.input_schema).toMatchObject({
            type: 'object',
            additionalProperties: false,
            properties: {
                query: { type: 'string' },
            },
        });
    });
});

describe('convertToolChoice', () => {
    it('should convert auto and none', () => {
        expect(convertToolChoice('auto')).toEqual({ type: 'auto' });
        expect(convertToolChoice('none')).toEqual({ type: 'none' });
    });

    it('should convert required to any', () => {
        expect(convertToolChoice('required')).toEqual({ type: 'any' });
    });

    it('should convert specific tool choice', () => {
        expect(
            convertToolChoice({
                type: 'tool',
                toolName: 'search',
            })
        ).toEqual({
            type: 'tool',
            name: 'search',
        });
    });
});

describe('structured output helpers', () => {
    it('should create output_config-based options for structured output', () => {
        const schema = z.object({
            city: z.string(),
            temperatureC: z.number(),
        });

        const result = createStructuredOutputOptions({
            messages: [{ role: 'user', content: 'Return weather as JSON' }],
            schema,
            schemaName: 'weather_schema',
            schemaDescription: 'Structured weather output',
            config: {
                maxTokens: 256,
            },
        });

        expect(result.toolChoice).toBeUndefined();
        expect(result.tools).toBeUndefined();
        expect(result.providerOptions).toMatchObject({
            output_config: {
                format: {
                    type: 'json_schema',
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                    },
                },
            },
        });
    });
});

describe('reasoning support', () => {
    it('should reconstruct thinking and redacted thinking parts in assistant messages', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'reasoning',
                        text: 'thought',
                        providerMetadata: {
                            anthropic: { signature: 'sig_123' },
                        },
                    },
                    {
                        type: 'reasoning',
                        text: '',
                        providerMetadata: {
                            anthropic: { redactedData: 'redacted_payload' },
                        },
                    },
                    {
                        type: 'text',
                        text: 'answer',
                    },
                ],
            },
        ];

        const result = convertMessages(messages);
        expect(result.messages).toEqual([
            {
                role: 'assistant',
                content: [
                    {
                        type: 'thinking',
                        thinking: 'thought',
                        signature: 'sig_123',
                    },
                    {
                        type: 'redacted_thinking',
                        data: 'redacted_payload',
                    },
                    {
                        type: 'text',
                        text: 'answer',
                    },
                ],
            },
        ]);
    });

    it('should wrap cross-provider reasoning in <thinking> tags', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'reasoning',
                        text: 'step-by-step thought',
                        providerMetadata: { openai: { encryptedContent: 'enc_123' } },
                    },
                    { type: 'text', text: 'answer' },
                ],
            },
        ];

        const result = convertMessages(messages);
        expect(result.messages).toEqual([
            {
                role: 'assistant',
                content: [
                    { type: 'text', text: '<thinking>step-by-step thought</thinking>' },
                    { type: 'text', text: 'answer' },
                ],
            },
        ]);
    });

    it('should map adaptive/manual reasoning fields and interleaved-thinking beta', () => {
        const adaptive = createGenerateRequest('claude-opus-4-6', 4096, {
            messages: [{ role: 'user', content: 'Hi' }],
            tools: {
                tool: defineTool({
                    name: 'tool',
                    description: 'Test tool',
                    parameters: z.object({ query: z.string() }),
                }),
            },
            reasoning: { effort: 'max' },
        });

        expect(adaptive).toMatchObject({
            thinking: { type: 'adaptive' },
            output_config: { effort: 'max' },
            betas: ['interleaved-thinking-2025-05-14'],
        });

        const manual = createGenerateRequest('claude-sonnet-4-5', 4096, {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'medium' },
        });
        expect(manual).toMatchObject({
            thinking: { type: 'enabled', budget_tokens: 8192 },
        });
        expect(manual).not.toHaveProperty('betas');
    });

    it('should validate incompatible config when reasoning is enabled', () => {
        expect(() =>
            createGenerateRequest('claude-sonnet-4', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'high' },
                config: { temperature: 0.2 },
            })
        ).toThrowError(ProviderError);

        expect(() =>
            createStreamRequest('claude-sonnet-4', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'high' },
                config: { topP: 0.9 },
            })
        ).toThrowError(ProviderError);

        expect(() =>
            createGenerateRequest('claude-sonnet-4', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'high' },
                toolChoice: { type: 'tool', toolName: 'search' },
            })
        ).toThrowError(ProviderError);

        expect(() =>
            createGenerateRequest('claude-sonnet-4', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'high' },
                config: { topP: 0.95 },
            })
        ).not.toThrow();

        expect(() =>
            createGenerateRequest('claude-sonnet-4', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'high' },
                toolChoice: 'auto',
                config: { topP: 0.96 },
            })
        ).not.toThrow();

        expect(() =>
            createGenerateRequest('claude-sonnet-4', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'high' },
                toolChoice: 'none',
            })
        ).not.toThrow();

        expect(() =>
            createGenerateRequest('claude-sonnet-4', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'high' },
                providerOptions: { top_k: 5 },
            })
        ).toThrowError(ProviderError);
    });

    it('should parse thinking and redacted_thinking blocks from responses', () => {
        const response = asAnthropicMessage({
            content: [
                {
                    type: 'thinking',
                    thinking: 'step-by-step',
                    signature: 'sig_1',
                },
                { type: 'redacted_thinking', data: 'hidden_data' },
                { type: 'text', text: 'answer', citations: null },
            ],
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 3 },
        });

        const result = mapGenerateResponse(response);
        expect(result.reasoning).toBe('step-by-step');
        expect(result.content).toBe('answer');
        expect(result.parts[0]).toEqual({
            type: 'reasoning',
            text: 'step-by-step',
            providerMetadata: {
                anthropic: { signature: 'sig_1' },
            },
        });
        expect(result.parts[1]).toEqual({
            type: 'reasoning',
            text: '',
            providerMetadata: {
                anthropic: { redactedData: 'hidden_data' },
            },
        });
    });

    it('should parse thinking block without signature', () => {
        const response = asAnthropicMessage({
            content: [
                { type: 'thinking', thinking: 'bare thought' },
                { type: 'text', text: 'answer', citations: null },
            ],
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 3 },
        });

        const result = mapGenerateResponse(response);
        expect(result.parts[0]).toEqual({
            type: 'reasoning',
            text: 'bare thought',
            providerMetadata: { anthropic: {} },
        });
    });

    it('should emit reasoning events from thinking deltas in streams', async () => {
        const events = [];
        for await (const event of transformStream(
            toAsyncIterable<RawMessageStreamEvent>([
                {
                    type: 'message_start',
                    message: asAnthropicMessage({
                        content: [],
                        stop_reason: null,
                        usage: { input_tokens: 10, output_tokens: 0 },
                    }),
                },
                {
                    type: 'content_block_start',
                    index: 0,
                    content_block: {
                        type: 'thinking',
                        thinking: '',
                    } as never,
                },
                {
                    type: 'content_block_delta',
                    index: 0,
                    delta: {
                        type: 'thinking_delta',
                        thinking: 'reason ',
                    } as never,
                },
                {
                    type: 'content_block_delta',
                    index: 0,
                    delta: {
                        type: 'signature_delta',
                        signature: 'sig_1',
                    } as never,
                },
                {
                    type: 'content_block_stop',
                    index: 0,
                },
                {
                    type: 'message_delta',
                    delta: {
                        stop_reason: 'end_turn',
                        stop_sequence: null,
                        container: null,
                    },
                    usage: {
                        input_tokens: 10,
                        output_tokens: 2,
                        cache_creation_input_tokens: null,
                        cache_read_input_tokens: null,
                        server_tool_use: null,
                    },
                },
                {
                    type: 'message_stop',
                },
            ])
        )) {
            events.push(event);
        }

        expect(events.map((event) => event.type)).toContain('reasoning-start');
        expect(events.map((event) => event.type)).toContain('reasoning-delta');
        expect(events.map((event) => event.type)).toContain('reasoning-end');
        expect(events.find((event) => event.type === 'reasoning-end')).toEqual({
            type: 'reasoning-end',
            providerMetadata: {
                anthropic: { signature: 'sig_1' },
            },
        });
    });

    it('should emit reasoning-end before tool-call events in stream', async () => {
        const events = [];
        for await (const event of transformStream(
            toAsyncIterable<RawMessageStreamEvent>([
                {
                    type: 'message_start',
                    message: asAnthropicMessage({
                        content: [],
                        stop_reason: null,
                        usage: { input_tokens: 10, output_tokens: 0 },
                    }),
                },
                {
                    type: 'content_block_start',
                    index: 0,
                    content_block: {
                        type: 'thinking',
                        thinking: '',
                    } as never,
                },
                {
                    type: 'content_block_delta',
                    index: 0,
                    delta: {
                        type: 'thinking_delta',
                        thinking: 'reasoning',
                    } as never,
                },
                {
                    type: 'content_block_stop',
                    index: 0,
                },
                {
                    type: 'content_block_start',
                    index: 1,
                    content_block: {
                        type: 'tool_use',
                        id: 'tu_1',
                        name: 'search',
                        input: {},
                    } as never,
                },
                {
                    type: 'content_block_delta',
                    index: 1,
                    delta: {
                        type: 'input_json_delta',
                        partial_json: '{"q":"test"}',
                    } as never,
                },
                {
                    type: 'content_block_stop',
                    index: 1,
                },
                {
                    type: 'message_delta',
                    delta: {
                        stop_reason: 'tool_use',
                        stop_sequence: null,
                        container: null,
                    },
                    usage: {
                        input_tokens: 10,
                        output_tokens: 4,
                        cache_creation_input_tokens: null,
                        cache_read_input_tokens: null,
                        server_tool_use: null,
                    },
                },
                { type: 'message_stop' },
            ])
        )) {
            events.push(event);
        }

        const types = events.map((e) => e.type);
        const reasoningEndIdx = types.indexOf('reasoning-end');
        const toolCallStartIdx = types.indexOf('tool-call-start');
        expect(reasoningEndIdx).toBeGreaterThan(-1);
        expect(toolCallStartIdx).toBeGreaterThan(reasoningEndIdx);
    });

    it('should close reasoning at end of stream when only thinking is present', async () => {
        const events = [];
        for await (const event of transformStream(
            toAsyncIterable<RawMessageStreamEvent>([
                {
                    type: 'message_start',
                    message: asAnthropicMessage({
                        content: [],
                        stop_reason: null,
                        usage: { input_tokens: 10, output_tokens: 0 },
                    }),
                },
                {
                    type: 'content_block_start',
                    index: 0,
                    content_block: {
                        type: 'thinking',
                        thinking: '',
                    } as never,
                },
                {
                    type: 'content_block_delta',
                    index: 0,
                    delta: {
                        type: 'thinking_delta',
                        thinking: 'only reasoning',
                    } as never,
                },
                {
                    type: 'content_block_stop',
                    index: 0,
                },
                {
                    type: 'message_delta',
                    delta: {
                        stop_reason: 'end_turn',
                        stop_sequence: null,
                        container: null,
                    },
                    usage: {
                        input_tokens: 10,
                        output_tokens: 1,
                        cache_creation_input_tokens: null,
                        cache_read_input_tokens: null,
                        server_tool_use: null,
                    },
                },
                { type: 'message_stop' },
            ])
        )) {
            events.push(event);
        }

        const types = events.map((e) => e.type);
        expect(types).toEqual([
            'reasoning-start',
            'reasoning-delta',
            'reasoning-end',
            'finish',
        ]);
    });
});

function asAnthropicMessage(value: {
    content: unknown[];
    stop_reason: AnthropicMessage['stop_reason'];
    usage: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens?: number | null;
        cache_creation_input_tokens?: number | null;
    };
}): AnthropicMessage {
    return {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-4-5',
        stop_sequence: null,
        container: null,
        content: value.content as AnthropicMessage['content'],
        stop_reason: value.stop_reason,
        usage: {
            input_tokens: value.usage.input_tokens,
            output_tokens: value.usage.output_tokens,
            cache_creation: null,
            cache_creation_input_tokens:
                value.usage.cache_creation_input_tokens ?? null,
            cache_read_input_tokens:
                value.usage.cache_read_input_tokens ?? null,
            server_tool_use: null,
            service_tier: null,
            output_tokens_details: null,
            input_tokens_details: null,
            cache_creation_tokens: null,
            cache_read_tokens: null,
            total_tokens: null,
            request_id: null,
            inference_geo: null,
        },
    } as unknown as AnthropicMessage;
}
