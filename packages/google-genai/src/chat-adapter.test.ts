import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    FinishReason as GoogleFinishReason,
    FunctionCallingConfigMode,
    type GenerateContentResponse,
} from '@google/genai';
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
import {
    defineTool,
    type GenerateOptions,
    type Message,
    type ToolSet,
} from '@core-ai/core-ai';
import { toAsyncIterable } from '@core-ai/testing';

describe('convertMessages', () => {
    it('should extract system message into systemInstruction', () => {
        const messages: Message[] = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
        ];

        const result = convertMessages(messages);
        expect(result.systemInstruction).toBe('You are helpful.');
        expect(result.contents).toEqual([
            {
                role: 'user',
                parts: [{ text: 'Hello' }],
            },
        ]);
    });

    it('should concatenate multiple system messages', () => {
        const messages: Message[] = [
            { role: 'system', content: 'Rule 1' },
            { role: 'system', content: 'Rule 2' },
            { role: 'user', content: 'Hello' },
        ];

        const result = convertMessages(messages);
        expect(result.systemInstruction).toBe('Rule 1\nRule 2');
    });

    it('should convert user text, image URL, and file parts', () => {
        const messages: Message[] = [
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'What is this?' },
                    {
                        type: 'image',
                        source: {
                            type: 'url',
                            url: 'https://example.com/img.png?x=1',
                        },
                    },
                    {
                        type: 'file',
                        data: 'base64-content',
                        mimeType: 'application/pdf',
                        filename: 'doc.pdf',
                    },
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            mediaType: 'image/jpeg',
                            data: 'base64-image',
                        },
                    },
                ],
            },
        ];

        const result = convertMessages(messages);

        expect(result.contents).toEqual([
            {
                role: 'user',
                parts: [
                    { text: 'What is this?' },
                    {
                        fileData: {
                            fileUri: 'https://example.com/img.png?x=1',
                            mimeType: 'application/octet-stream',
                        },
                    },
                    {
                        inlineData: {
                            data: 'base64-content',
                            mimeType: 'application/pdf',
                        },
                    },
                    {
                        inlineData: {
                            data: 'base64-image',
                            mimeType: 'image/jpeg',
                        },
                    },
                ],
            },
        ]);
    });

    it('should convert an assistant message with tool calls', () => {
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

        expect(convertMessages(messages).contents).toEqual([
            {
                role: 'model',
                parts: [
                    {
                        functionCall: {
                            id: 'tc_1',
                            name: 'search',
                            args: { query: 'weather' },
                        },
                    },
                ],
            },
        ]);
    });

    it('should convert a tool result message', () => {
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
                    {
                        type: 'tool-call',
                        toolCall: {
                            id: 'tc_2',
                            name: 'temperature',
                            arguments: { city: 'Berlin' },
                        },
                    },
                ],
            },
            {
                role: 'tool',
                toolCallId: 'tc_1',
                content: 'Sunny, 72F',
            },
            {
                role: 'tool',
                toolCallId: 'tc_2',
                content: '18C',
            },
        ];

        expect(convertMessages(messages).contents).toEqual([
            {
                role: 'model',
                parts: [
                    {
                        functionCall: {
                            id: 'tc_1',
                            name: 'search',
                            args: { query: 'weather' },
                        },
                    },
                    {
                        functionCall: {
                            id: 'tc_2',
                            name: 'temperature',
                            args: { city: 'Berlin' },
                        },
                    },
                ],
            },
            {
                role: 'user',
                parts: [
                    {
                        functionResponse: {
                            id: 'tc_1',
                            name: 'search',
                            response: { output: 'Sunny, 72F' },
                        },
                    },
                    {
                        functionResponse: {
                            id: 'tc_2',
                            name: 'temperature',
                            response: { output: '18C' },
                        },
                    },
                ],
            },
        ]);
    });

    it('should mark tool errors in function response payload', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'tool-call',
                        toolCall: { id: 'tc_1', name: 'search', arguments: {} },
                    },
                ],
            },
            {
                role: 'tool',
                toolCallId: 'tc_1',
                content: 'timeout',
                isError: true,
            },
        ];

        const result = convertMessages(messages);
        const part = result.contents[1]?.parts?.[0];
        expect(part?.functionResponse?.response).toEqual({ error: 'timeout' });
    });
});

describe('convertTools', () => {
    it('should convert a tool set to Google format', () => {
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

        expect(result).toHaveLength(1);
        const firstTool = result[0];
        if (!firstTool?.functionDeclarations?.[0]) {
            throw new Error('Expected first function declaration');
        }

        expect(firstTool.functionDeclarations[0].name).toBe('search');
        expect(firstTool.functionDeclarations[0].description).toBe(
            'Search the web'
        );
        expect(
            firstTool.functionDeclarations[0].parametersJsonSchema
        ).toMatchObject({
            type: 'object',
            properties: {
                query: { type: 'string' },
            },
        });
    });
});

describe('convertToolChoice', () => {
    it('should map core string choices to function calling config', () => {
        expect(convertToolChoice('auto')).toEqual({
            functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
        });
        expect(convertToolChoice('none')).toEqual({
            functionCallingConfig: { mode: FunctionCallingConfigMode.NONE },
        });
        expect(convertToolChoice('required')).toEqual({
            functionCallingConfig: { mode: FunctionCallingConfigMode.ANY },
        });
    });

    it('should convert specific tool choice', () => {
        expect(
            convertToolChoice({
                type: 'tool',
                toolName: 'search',
            })
        ).toEqual({
            functionCallingConfig: {
                mode: FunctionCallingConfigMode.ANY,
                allowedFunctionNames: ['search'],
            },
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
            maxTokens: 256,
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
    it('should reconstruct assistant reasoning parts as thought parts', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'reasoning',
                        text: 'thinking',
                        providerMetadata: {
                            google: { thoughtSignature: 'sig_1' },
                        },
                    },
                    {
                        type: 'text',
                        text: 'answer',
                    },
                ],
            },
        ];

        expect(convertMessages(messages).contents).toEqual([
            {
                role: 'model',
                parts: [
                    {
                        text: 'thinking',
                        thought: true,
                        thoughtSignature: 'sig_1',
                    },
                    {
                        text: 'answer',
                    },
                ],
            },
        ]);
    });

    it('should send cross-provider reasoning as a thought part without a signature', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'reasoning',
                        text: 'step-by-step thought',
                        providerMetadata: {
                            anthropic: { signature: 'sig_123' },
                        },
                    },
                    { type: 'text', text: 'answer' },
                ],
            },
        ];

        expect(convertMessages(messages).contents).toEqual([
            {
                role: 'model',
                parts: [
                    { text: 'step-by-step thought', thought: true },
                    { text: 'answer' },
                ],
            },
        ]);
    });

    it('should map reasoning config to thinkingLevel for Gemini 3', () => {
        const request = createGenerateRequest('gemini-3-pro', {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'high' },
        });

        expect(request.config).toMatchObject({
            thinkingConfig: {
                thinkingLevel: 'HIGH',
                includeThoughts: true,
            },
        });
    });

    it('should map reasoning config to thinkingBudget for Gemini 2.5', () => {
        const request = createGenerateRequest('gemini-2.5-pro', {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'low' },
        });

        expect(request.config).toMatchObject({
            thinkingConfig: {
                thinkingBudget: 4096,
                includeThoughts: true,
            },
        });
    });

    it('should not allow provider reasoning config overrides', () => {
        const request = createGenerateRequest('gemini-3-pro', {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'high' },
        });

        expect(request.config).toMatchObject({
            thinkingConfig: {
                thinkingLevel: 'HIGH',
                includeThoughts: true,
            },
        });
    });

    it('should map namespaced google sampling provider options', () => {
        const request = createGenerateRequest('gemini-2.5-pro', {
            messages: [{ role: 'user', content: 'Hi' }],
            providerOptions: {
                google: {
                    stopSequences: ['END'],
                    frequencyPenalty: 0.1,
                    presencePenalty: 0.2,
                    topK: 24,
                },
            },
        });

        expect(request.config).toMatchObject({
            stopSequences: ['END'],
            frequencyPenalty: 0.1,
            presencePenalty: 0.2,
            topK: 24,
        });
    });

    it('should reject invalid google provider options', () => {
        const invalidProviderOptions = {
            google: { topK: '24' },
        } as unknown as GenerateOptions['providerOptions'];

        expect(() =>
            createGenerateRequest('gemini-2.5-pro', {
                messages: [{ role: 'user', content: 'Hi' }],
                providerOptions: invalidProviderOptions,
            })
        ).toThrowError(/Expected number/);
    });

    it('should reject null google provider options', () => {
        const invalidProviderOptions = {
            google: null,
        } as unknown as GenerateOptions['providerOptions'];

        expect(() =>
            createGenerateRequest('gemini-2.5-pro', {
                messages: [{ role: 'user', content: 'Hi' }],
                providerOptions: invalidProviderOptions,
            })
        ).toThrowError(/Expected object, received null/);
    });

    it('should reject raw google config on generate requests', () => {
        const invalidProviderOptions = {
            google: {
                config: {
                    thinkingConfig: {
                        thinkingLevel: 'LOW',
                    },
                },
            },
        } as unknown as GenerateOptions['providerOptions'];

        expect(() =>
            createGenerateRequest('gemini-2.5-pro', {
                messages: [{ role: 'user', content: 'Hi' }],
                providerOptions: invalidProviderOptions,
            })
        ).toThrowError(/Unrecognized key\(s\) in object: 'config'/);
    });

    it('should extract reasoning parts from thought response parts', () => {
        const response = asGenerateContentResponse({
            candidates: [
                {
                    finishReason: GoogleFinishReason.STOP,
                    content: {
                        role: 'model',
                        parts: [
                            {
                                text: 'internal thought',
                                thought: true,
                                thoughtSignature: 'sig_1',
                            },
                            {
                                text: 'final answer',
                                thought: false,
                            },
                        ],
                    },
                },
            ],
            usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 2,
                thoughtsTokenCount: 1,
                totalTokenCount: 13,
            },
        });

        const result = mapGenerateResponse(response);
        expect(result.reasoning).toBe('internal thought');
        expect(result.content).toBe('final answer');
        expect(result.parts[0]).toEqual({
            type: 'reasoning',
            text: 'internal thought',
            providerMetadata: {
                google: { thoughtSignature: 'sig_1' },
            },
        });
        expect(result.usage.outputTokenDetails.reasoningTokens).toBe(1);
    });

    it('should skip empty thought text in response parts', () => {
        const response = asGenerateContentResponse({
            candidates: [
                {
                    finishReason: GoogleFinishReason.STOP,
                    content: {
                        role: 'model',
                        parts: [
                            { text: '', thought: true },
                            { text: 'answer', thought: false },
                        ],
                    },
                },
            ],
            usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 2,
                totalTokenCount: 12,
            },
        });

        const result = mapGenerateResponse(response);
        expect(result.reasoning).toBeNull();
        expect(result.parts).toEqual([{ type: 'text', text: 'answer' }]);
    });

    it('should emit reasoning events for thought deltas in streams', async () => {
        const events = [];
        for await (const event of transformStream(
            toAsyncIterable<GenerateContentResponse>([
                asGenerateContentResponse({
                    candidates: [
                        {
                            content: {
                                role: 'model',
                                parts: [{ text: 'reason ', thought: true }],
                            },
                        },
                    ],
                }),
                asGenerateContentResponse({
                    text: 'answer',
                    candidates: [{ finishReason: GoogleFinishReason.STOP }],
                    usageMetadata: {
                        promptTokenCount: 10,
                        candidatesTokenCount: 2,
                        totalTokenCount: 12,
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

    it('should emit reasoning-end before tool-call events in stream', async () => {
        const events = [];
        for await (const event of transformStream(
            toAsyncIterable<GenerateContentResponse>([
                asGenerateContentResponse({
                    candidates: [
                        {
                            content: {
                                role: 'model',
                                parts: [{ text: 'thinking', thought: true }],
                            },
                        },
                    ],
                }),
                asGenerateContentResponse({
                    candidates: [{ finishReason: GoogleFinishReason.STOP }],
                    functionCalls: [
                        {
                            name: 'search',
                            args: { q: 'test' },
                        },
                    ],
                    usageMetadata: {
                        promptTokenCount: 10,
                        candidatesTokenCount: 2,
                        totalTokenCount: 12,
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

    it('should handle multiple thought deltas across chunks', async () => {
        const events = [];
        for await (const event of transformStream(
            toAsyncIterable<GenerateContentResponse>([
                asGenerateContentResponse({
                    candidates: [
                        {
                            content: {
                                role: 'model',
                                parts: [{ text: 'first ', thought: true }],
                            },
                        },
                    ],
                }),
                asGenerateContentResponse({
                    candidates: [
                        {
                            content: {
                                role: 'model',
                                parts: [{ text: 'second ', thought: true }],
                            },
                        },
                    ],
                }),
                asGenerateContentResponse({
                    text: 'answer',
                    candidates: [{ finishReason: GoogleFinishReason.STOP }],
                    usageMetadata: {
                        promptTokenCount: 10,
                        candidatesTokenCount: 2,
                        totalTokenCount: 12,
                    },
                }),
            ])
        )) {
            events.push(event);
        }

        expect(events.map((e) => e.type)).toEqual([
            'reasoning-start',
            'reasoning-delta',
            'reasoning-delta',
            'reasoning-end',
            'text-delta',
            'finish',
        ]);
        expect(events[1]).toMatchObject({ text: 'first ' });
        expect(events[2]).toMatchObject({ text: 'second ' });
    });

    it('should close reasoning at end of stream when only thinking is present', async () => {
        const events = [];
        for await (const event of transformStream(
            toAsyncIterable<GenerateContentResponse>([
                asGenerateContentResponse({
                    candidates: [
                        {
                            content: {
                                role: 'model',
                                parts: [
                                    { text: 'only reasoning', thought: true },
                                ],
                            },
                        },
                    ],
                }),
                asGenerateContentResponse({
                    candidates: [{ finishReason: GoogleFinishReason.STOP }],
                    usageMetadata: {
                        promptTokenCount: 10,
                        candidatesTokenCount: 1,
                        totalTokenCount: 11,
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

function asGenerateContentResponse(
    value: Partial<GenerateContentResponse>
): GenerateContentResponse {
    return {
        candidates: [],
        ...value,
    } as GenerateContentResponse;
}
