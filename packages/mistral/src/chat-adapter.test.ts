import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type {
    ChatCompletionResponse,
    CompletionEvent,
} from '@mistralai/mistralai/models/components';
import { defineTool, type Message, type ToolSet } from '@core-ai/core-ai';
import {
    createGenerateRequest,
    createStructuredOutputOptions,
    convertMessages,
    convertToolChoice,
    convertTools,
    getStructuredOutputToolName,
    mapGenerateResponse,
    transformStream,
} from './chat-adapter.js';

describe('convertMessages', () => {
    it('should convert system and user text messages', () => {
        const messages: Message[] = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
        ];

        expect(convertMessages(messages)).toEqual([
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
        ]);
    });

    it('should convert user image and file content', () => {
        const messages: Message[] = [
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Analyze this' },
                    {
                        type: 'image',
                        source: {
                            type: 'url',
                            url: 'https://example.com/image.png',
                        },
                    },
                    {
                        type: 'file',
                        data: 'base64-file',
                        mimeType: 'application/pdf',
                        filename: 'document.pdf',
                    },
                ],
            },
        ];

        expect(convertMessages(messages)).toEqual([
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Analyze this' },
                    {
                        type: 'image_url',
                        imageUrl: {
                            url: 'https://example.com/image.png',
                        },
                    },
                    {
                        type: 'document_url',
                        documentUrl: 'data:application/pdf;base64,base64-file',
                        documentName: 'document.pdf',
                    },
                ],
            },
        ]);
    });

    it('should convert assistant tool calls', () => {
        const messages: Message[] = [
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

        expect(convertMessages(messages)).toEqual([
            {
                role: 'assistant',
                content: null,
                toolCalls: [
                    {
                        id: 'tc_1',
                        type: 'function',
                        function: {
                            name: 'search',
                            arguments: { query: 'weather' },
                        },
                    },
                ],
            },
        ]);
    });

    it('should convert tool result messages', () => {
        const messages: Message[] = [
            {
                role: 'tool',
                toolCallId: 'tc_1',
                content: 'Sunny',
            },
        ];

        expect(convertMessages(messages)).toEqual([
            {
                role: 'tool',
                toolCallId: 'tc_1',
                content: 'Sunny',
            },
        ]);
    });
});

describe('convertTools', () => {
    it('should convert tool schema to mistral tool format', () => {
        const tools: ToolSet = {
            search: defineTool({
                name: 'search',
                description: 'Search the web',
                parameters: z.object({
                    query: z.string(),
                }),
            }),
        };

        const result = convertTools(tools);
        expect(result[0]?.type).toBe('function');
        expect(result[0]?.function.name).toBe('search');
        expect(result[0]?.function.description).toBe('Search the web');
        expect(result[0]?.function.parameters).toMatchObject({
            type: 'object',
            properties: {
                query: { type: 'string' },
            },
        });
    });
});

describe('convertToolChoice', () => {
    it('should pass through string choices', () => {
        expect(convertToolChoice('auto')).toBe('auto');
        expect(convertToolChoice('none')).toBe('none');
        expect(convertToolChoice('required')).toBe('required');
    });

    it('should convert specific tool choice', () => {
        expect(
            convertToolChoice({
                type: 'tool',
                toolName: 'search',
            })
        ).toEqual({
            type: 'function',
            function: { name: 'search' },
        });
    });
});

describe('structured output helpers', () => {
    it('should create tool-based generate options for structured output', () => {
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

        expect(result.toolChoice).toEqual({
            type: 'tool',
            toolName: 'weather_schema',
        });
        expect(result.tools).toMatchObject({
            structured_output: {
                name: 'weather_schema',
                description: 'Structured weather output',
            },
        });
    });

    it('should derive default structured output tool name', () => {
        const schema = z.object({
            ok: z.boolean(),
        });

        expect(
            getStructuredOutputToolName({
                messages: [{ role: 'user', content: 'json' }],
                schema,
            })
        ).toBe('core_ai_generate_object');
    });
});

describe('reasoning support', () => {
    it('should ignore reasoning parts when converting assistant messages', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                parts: [
                    { type: 'reasoning', text: 'thoughts' },
                    { type: 'text', text: 'answer' },
                ],
            },
        ];

        expect(convertMessages(messages)).toEqual([
            { role: 'assistant', content: 'answer' },
        ]);
    });

    it('should accept reasoning config as a no-op in requests', () => {
        const request = createGenerateRequest('magistral-medium-latest', {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'high' },
            config: { maxTokens: 256 },
        });

        expect(request).toMatchObject({
            model: 'magistral-medium-latest',
            maxTokens: 256,
            messages: [{ role: 'user', content: 'Hi' }],
        });
    });

    it('should extract reasoning parts from thinking content chunks', () => {
        const response = asChatCompletionResponse({
            choices: [
                {
                    index: 0,
                    finishReason: 'stop',
                    message: {
                        role: 'assistant',
                        content: [
                            {
                                type: 'thinking',
                                thinking: [{ text: 'step-by-step' }],
                            },
                            {
                                type: 'text',
                                text: 'answer',
                            },
                        ],
                        toolCalls: null,
                    },
                },
            ],
            usage: {
                promptTokens: 10,
                completionTokens: 3,
                totalTokens: 13,
            },
        });

        const result = mapGenerateResponse(response);
        expect(result.reasoning).toBe('step-by-step');
        expect(result.content).toBe('answer');
        expect(result.parts[0]).toEqual({
            type: 'reasoning',
            text: 'step-by-step',
        });
    });

    it('should emit reasoning events for thinking stream chunks', async () => {
        const events = [];
        for await (const event of transformStream(
            toAsyncIterable<CompletionEvent>([
                asCompletionEvent({
                    choices: [
                        {
                            index: 0,
                            finishReason: null,
                            delta: {
                                content: [
                                    {
                                        type: 'thinking',
                                        thinking: [{ text: 'reason ' }],
                                    },
                                ],
                            },
                        },
                    ],
                }),
                asCompletionEvent({
                    choices: [
                        {
                            index: 0,
                            finishReason: 'stop',
                            delta: {
                                content: [
                                    {
                                        type: 'text',
                                        text: 'answer',
                                    },
                                ],
                            },
                        },
                    ],
                    usage: {
                        promptTokens: 10,
                        completionTokens: 2,
                        totalTokens: 12,
                    },
                }),
            ])
        )) {
            events.push(event);
        }

        expect(events.map((event) => event.type)).toContain('reasoning-start');
        expect(events.map((event) => event.type)).toContain('reasoning-delta');
        expect(events.map((event) => event.type)).toContain('reasoning-end');
    });

    it('should extract reasoning alongside tool calls from response', () => {
        const response = asChatCompletionResponse({
            choices: [
                {
                    index: 0,
                    finishReason: 'tool_calls',
                    message: {
                        role: 'assistant',
                        content: [
                            {
                                type: 'thinking',
                                thinking: [{ text: 'deciding which tool' }],
                            },
                        ],
                        toolCalls: [
                            {
                                id: 'tc_1',
                                type: 'function',
                                function: {
                                    name: 'search',
                                    arguments: '{"q":"test"}',
                                },
                            },
                        ],
                    },
                },
            ],
            usage: {
                promptTokens: 10,
                completionTokens: 5,
                totalTokens: 15,
            },
        });

        const result = mapGenerateResponse(response);
        expect(result.reasoning).toBe('deciding which tool');
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls[0]).toMatchObject({ name: 'search' });
        expect(result.finishReason).toBe('tool-calls');
    });

    it('should emit reasoning-end before tool-call events in stream', async () => {
        const events = [];
        for await (const event of transformStream(
            toAsyncIterable<CompletionEvent>([
                asCompletionEvent({
                    choices: [
                        {
                            index: 0,
                            finishReason: null,
                            delta: {
                                content: [
                                    {
                                        type: 'thinking',
                                        thinking: [{ text: 'reasoning' }],
                                    },
                                ],
                            },
                        },
                    ],
                }),
                asCompletionEvent({
                    choices: [
                        {
                            index: 0,
                            finishReason: 'tool_calls',
                            delta: {
                                toolCalls: [
                                    {
                                        id: 'tc_1',
                                        type: 'function',
                                        function: {
                                            name: 'search',
                                            arguments: '{"q":"test"}',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                    usage: {
                        promptTokens: 10,
                        completionTokens: 2,
                        totalTokens: 12,
                    },
                }),
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
            toAsyncIterable<CompletionEvent>([
                asCompletionEvent({
                    choices: [
                        {
                            index: 0,
                            finishReason: null,
                            delta: {
                                content: [
                                    {
                                        type: 'thinking',
                                        thinking: [{ text: 'only reasoning' }],
                                    },
                                ],
                            },
                        },
                    ],
                }),
                asCompletionEvent({
                    choices: [
                        {
                            index: 0,
                            finishReason: 'stop',
                            delta: {},
                        },
                    ],
                    usage: {
                        promptTokens: 10,
                        completionTokens: 1,
                        totalTokens: 11,
                    },
                }),
            ])
        )) {
            events.push(event);
        }

        expect(events.map((e) => e.type)).toEqual([
            'reasoning-start',
            'reasoning-delta',
            'reasoning-end',
            'finish',
        ]);
    });
});

function asChatCompletionResponse(
    value: Partial<ChatCompletionResponse>
): ChatCompletionResponse {
    return {
        id: 'chatcmpl-1',
        object: 'chat.completion',
        model: 'mistral-large-latest',
        usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
        },
        created: Date.now(),
        choices: [],
        ...value,
    };
}

function asCompletionEvent(value: {
    choices: Array<{
        index: number;
        finishReason: string | null;
        delta: {
            content?:
                | string
                | null
                | Array<{
                      type: string;
                      text?: string;
                      thinking?: Array<{ text: string }>;
                  }>;
            toolCalls?: Array<{
                id?: string;
                type?: string;
                index?: number;
                function: {
                    name: string;
                    arguments: string;
                };
            }>;
        };
    }>;
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
    };
}): CompletionEvent {
    return {
        data: {
            id: 'chunk-1',
            model: 'mistral-large-latest',
            choices: value.choices as CompletionEvent['data']['choices'],
            ...(value.usage ? { usage: value.usage } : {}),
        },
    };
}

async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
    for (const item of items) {
        yield item;
    }
}
