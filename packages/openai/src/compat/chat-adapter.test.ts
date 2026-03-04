import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    createGenerateRequest,
    createStreamRequest,
    createStructuredOutputOptions,
    convertMessages,
    convertToolChoice,
    convertTools,
    getStructuredOutputToolName,
    mapGenerateResponse,
} from './chat-adapter.js';
import { ProviderError, defineTool, type Message, type ToolSet } from '@core-ai/core-ai';
import type { ChatCompletion } from 'openai/resources/chat/completions/completions';

describe('convertMessages', () => {
    it('should convert a system message', () => {
        const messages: Message[] = [
            { role: 'system', content: 'You are helpful.' },
        ];

        expect(convertMessages(messages)).toEqual([
            { role: 'system', content: 'You are helpful.' },
        ]);
    });

    it('should convert a simple user message', () => {
        const messages: Message[] = [{ role: 'user', content: 'Hello' }];

        expect(convertMessages(messages)).toEqual([
            { role: 'user', content: 'Hello' },
        ]);
    });

    it('should convert a user message with image URL', () => {
        const messages: Message[] = [
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'What is this?' },
                    {
                        type: 'image',
                        source: {
                            type: 'url',
                            url: 'https://example.com/img.png',
                        },
                    },
                ],
            },
        ];

        expect(convertMessages(messages)).toEqual([
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'What is this?' },
                    {
                        type: 'image_url',
                        image_url: { url: 'https://example.com/img.png' },
                    },
                ],
            },
        ]);
    });

    it('should convert a user message with a file', () => {
        const messages: Message[] = [
            {
                role: 'user',
                content: [
                    {
                        type: 'file',
                        data: 'base64-content',
                        mimeType: 'application/pdf',
                        filename: 'doc.pdf',
                    },
                ],
            },
        ];

        expect(convertMessages(messages)).toEqual([
            {
                role: 'user',
                content: [
                    {
                        type: 'file',
                        file: {
                            file_data: 'base64-content',
                            filename: 'doc.pdf',
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

        expect(convertMessages(messages)).toEqual([
            {
                role: 'assistant',
                content: null,
                tool_calls: [
                    {
                        id: 'tc_1',
                        type: 'function',
                        function: {
                            name: 'search',
                            arguments: '{"query":"weather"}',
                        },
                    },
                ],
            },
        ]);
    });

    it('should convert a tool result message', () => {
        const messages: Message[] = [
            {
                role: 'tool',
                toolCallId: 'tc_1',
                content: 'Sunny, 72F',
            },
        ];

        expect(convertMessages(messages)).toEqual([
            {
                role: 'tool',
                tool_call_id: 'tc_1',
                content: 'Sunny, 72F',
            },
        ]);
    });
});

describe('convertTools', () => {
    it('should convert a tool set to OpenAI format', () => {
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
        const firstTool = result[0];
        expect(firstTool?.type).toBe('function');

        if (!firstTool || firstTool.type !== 'function') {
            throw new Error('Expected first tool to be a function tool');
        }

        expect(firstTool.function.name).toBe('search');
        expect(firstTool.function.description).toBe('Search the web');
        expect(firstTool.function.parameters).toMatchObject({
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
                temperature: 0,
                maxTokens: 128,
            },
        });

        expect(result.messages).toEqual([
            { role: 'user', content: 'Return weather as JSON' },
        ]);
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
        expect(result.config).toEqual({
            temperature: 0,
            maxTokens: 128,
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
    it('should fold reasoning parts into text content wrapped in <thinking> tags', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                parts: [
                    { type: 'reasoning', text: 'thinking...' },
                    { type: 'text', text: 'answer' },
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
                content: '<thinking>thinking...</thinking>\n\nanswer',
                tool_calls: [
                    {
                        id: 'tc_1',
                        type: 'function',
                        function: {
                            name: 'search',
                            arguments: '{"query":"weather"}',
                        },
                    },
                ],
            },
        ]);
    });

    it('should map and clamp reasoning effort for supported models', () => {
        const request = createGenerateRequest('gpt-5.2', {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'max' },
        });

        expect(request).toMatchObject({
            model: 'gpt-5.2',
            reasoning_effort: 'xhigh',
        });

        const clamped = createGenerateRequest('gpt-5.1', {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'minimal' },
        });
        expect(clamped).toMatchObject({
            reasoning_effort: 'low',
        });
    });

    it('should skip reasoning effort for unsupported models', () => {
        const request = createGenerateRequest('o1-mini', {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'low' },
        });

        expect(request).not.toHaveProperty('reasoning_effort');
    });

    it('should validate restricted sampling params for GPT-5.1+ when reasoning is enabled', () => {
        expect(() =>
            createGenerateRequest('gpt-5.1', {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'medium' },
                config: { temperature: 0.2 },
            })
        ).toThrowError(ProviderError);

        expect(() =>
            createStreamRequest('gpt-5.2', {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'medium' },
                config: { topP: 0.9 },
            })
        ).toThrowError(ProviderError);

        expect(() =>
            createGenerateRequest('o3', {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'medium' },
                config: { temperature: 0.2, topP: 0.9 },
            })
        ).not.toThrow();
    });

    it('should not extract reasoning text from generate responses (Chat Completions API does not expose it)', () => {
        const response = asChatCompletion({
            choices: [
                {
                    index: 0,
                    finish_reason: 'stop',
                    logprobs: null,
                    message: {
                        role: 'assistant',
                        content: 'final answer',
                        refusal: null,
                        tool_calls: [
                            {
                                id: 'tc_1',
                                type: 'function',
                                function: {
                                    name: 'search',
                                    arguments: '{"query":"weather"}',
                                },
                            },
                        ],
                    },
                },
            ],
            usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
                completion_tokens_details: {
                    reasoning_tokens: 2,
                },
            },
        });

        const result = mapGenerateResponse(response);

        expect(result.reasoning).toBeNull();
        expect(result.content).toBe('final answer');
        expect(result.parts).toEqual([
            { type: 'text', text: 'final answer' },
            {
                type: 'tool-call',
                toolCall: {
                    id: 'tc_1',
                    name: 'search',
                    arguments: { query: 'weather' },
                },
            },
        ]);
        expect(result.usage.outputTokenDetails.reasoningTokens).toBe(2);
    });

    it('should not add reasoning_effort when reasoning is not configured', () => {
        const request = createGenerateRequest('gpt-5.1', {
            messages: [{ role: 'user', content: 'Hi' }],
        });

        expect(request).not.toHaveProperty('reasoning_effort');
    });

});

function asChatCompletion(value: Partial<ChatCompletion>): ChatCompletion {
    return {
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-5-mini',
        choices: [],
        ...value,
    };
}
