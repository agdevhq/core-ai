import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    createGenerateRequest,
    createStreamRequest,
    convertMessages,
    convertToolChoice,
    convertTools,
    mapGenerateResponse,
    transformStream,
} from './chat-adapter.js';
import {
    ValidationError,
    defineTool,
    type GenerateOptions,
    type Message,
    type ToolSet,
} from '@core-ai/core-ai';
import type { OpenAICompatRequestOptions } from '../provider-options.js';
import {
    createStructuredOutputRequestOptions,
    getStructuredOutputName,
} from '../shared/structured-output.js';
import type {
    ChatCompletion,
    ChatCompletionChunk,
} from 'openai/resources/chat/completions/completions';

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
                    {
                        type: 'text',
                        text: 'What is this?',
                        metadata: { classification: 'public' },
                    },
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
                            metadata: { transformed: true },
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
                metadata: { validated: true },
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
    it('should create a native JSON Schema response format', () => {
        const schema = z.object({
            city: z.string(),
            temperatureC: z.number(),
        });

        const request = createGenerateRequest(
            'gpt-5.6-luna',
            createStructuredOutputRequestOptions({
                messages: [{ role: 'user', content: 'Return weather as JSON' }],
                schema,
                schemaName: 'weather_schema',
                schemaDescription: 'Structured weather output',
                temperature: 0,
                maxTokens: 128,
            })
        );

        expect(request).toMatchObject({
            model: 'gpt-5.6-luna',
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: 'weather_schema',
                    description: 'Structured weather output',
                    strict: true,
                    schema: {
                        type: 'object',
                        required: ['city', 'temperatureC'],
                    },
                },
            },
            temperature: 0,
            max_tokens: 128,
        });
        expect(request).not.toHaveProperty('tools');
        expect(request).not.toHaveProperty('tool_choice');
    });

    it('should create a forced tool request for compatible endpoints', () => {
        const request = createGenerateRequest(
            'qwen3-235b',
            createStructuredOutputRequestOptions(
                {
                    messages: [
                        { role: 'user', content: 'Return weather as JSON' },
                    ],
                    schema: z.object({
                        city: z.string(),
                        temperatureC: z.number(),
                    }),
                    schemaName: 'weather_schema',
                },
                'tool'
            )
        );

        expect(request).toMatchObject({
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'weather_schema',
                    },
                },
            ],
            tool_choice: {
                type: 'function',
                function: {
                    name: 'weather_schema',
                },
            },
        });
        expect(request).not.toHaveProperty('response_format');
    });

    it('should derive the default structured output name', () => {
        const schema = z.object({
            ok: z.boolean(),
        });

        expect(
            getStructuredOutputName({
                messages: [{ role: 'user', content: 'json' }],
                schema,
            })
        ).toBe('core_ai_generate_object');
    });
});

describe('max tokens parameter', () => {
    const messages: Message[] = [{ role: 'user', content: 'Hi' }];

    it('should send max_completion_tokens for known OpenAI reasoning models', () => {
        const request = createGenerateRequest('gpt-5-mini', {
            messages,
            maxTokens: 256,
        });

        expect(request).toMatchObject({ max_completion_tokens: 256 });
        expect(request).not.toHaveProperty('max_tokens');
    });

    it('should send max_completion_tokens for date-suffixed reasoning model ids', () => {
        const request = createGenerateRequest('gpt-5-mini-2025-08-07', {
            messages,
            maxTokens: 64,
        });

        expect(request).toMatchObject({ max_completion_tokens: 64 });
        expect(request).not.toHaveProperty('max_tokens');
    });

    it('should send max_tokens for unknown model ids', () => {
        const request = createGenerateRequest('qwen3-235b', {
            messages,
            maxTokens: 256,
        });

        expect(request).toMatchObject({ max_tokens: 256 });
        expect(request).not.toHaveProperty('max_completion_tokens');
    });

    it('should honor a maxTokensParam override to max_completion_tokens', () => {
        const request = createStreamRequest('custom-gateway-model', {
            messages,
            maxTokens: 128,
            providerOptions: {
                openai: { maxTokensParam: 'max_completion_tokens' },
            },
        });

        expect(request).toMatchObject({ max_completion_tokens: 128 });
        expect(request).not.toHaveProperty('max_tokens');
    });

    it('should honor a maxTokensParam override to max_tokens', () => {
        const request = createGenerateRequest('gpt-5.2', {
            messages,
            maxTokens: 128,
            providerOptions: {
                openai: { maxTokensParam: 'max_tokens' },
            },
        });

        expect(request).toMatchObject({ max_tokens: 128 });
        expect(request).not.toHaveProperty('max_completion_tokens');
    });

    it('should omit both fields when maxTokens is not set', () => {
        const request = createGenerateRequest('gpt-5-mini', { messages });

        expect(request).not.toHaveProperty('max_tokens');
        expect(request).not.toHaveProperty('max_completion_tokens');
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
                temperature: 0.2,
            })
        ).toThrowError(ValidationError);

        expect(() =>
            createStreamRequest('gpt-5.2', {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'medium' },
                topP: 0.9,
            })
        ).toThrowError(ValidationError);

        expect(() =>
            createGenerateRequest('o3', {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'medium' },
                temperature: 0.2,
                topP: 0.9,
            })
        ).not.toThrow();
    });

    it('should accept compat-only provider options in the openai namespace', () => {
        const compatOptions: OpenAICompatRequestOptions = {
            stopSequences: ['END'],
            frequencyPenalty: 0.1,
            presencePenalty: 0.2,
            seed: 42,
        };

        const request = createGenerateRequest('gpt-4o-mini', {
            messages: [{ role: 'user', content: 'Hi' }],
            providerOptions: {
                openai: compatOptions,
            },
        });

        expect(request).toMatchObject({
            stop: ['END'],
            frequency_penalty: 0.1,
            presence_penalty: 0.2,
            seed: 42,
        });
    });

    it('should reject responses-only include provider option in compat mode', () => {
        expect(() =>
            createGenerateRequest('gpt-4o-mini', {
                messages: [{ role: 'user', content: 'Hi' }],
                providerOptions: {
                    openai: {
                        include: ['reasoning.encrypted_content'],
                    },
                },
            })
        ).toThrowError(/unrecognized_keys/);
    });

    it('should reject invalid compat provider options', () => {
        const invalidProviderOptions = {
            openai: { seed: 1.5 },
        } as unknown as GenerateOptions['providerOptions'];

        expect(() =>
            createGenerateRequest('gpt-4o-mini', {
                messages: [{ role: 'user', content: 'Hi' }],
                providerOptions: invalidProviderOptions,
            })
        ).toThrowError(/expected.*int/i);
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

    it('should only extract nonstandard reasoning fields in compatibility mode', () => {
        const message = {
            role: 'assistant' as const,
            content: 'final answer',
            refusal: null,
            reasoning_content: 'preferred reasoning',
            reasoning: 'fallback reasoning',
        };
        const response = asChatCompletion({
            choices: [
                {
                    index: 0,
                    finish_reason: 'stop',
                    logprobs: null,
                    message,
                },
            ],
        });

        expect(mapGenerateResponse(response).reasoning).toBeNull();
        expect(
            mapGenerateResponse(response, { compatibility: true })
        ).toMatchObject({
            reasoning: 'preferred reasoning',
            parts: [
                { type: 'reasoning', text: 'preferred reasoning' },
                { type: 'text', text: 'final answer' },
            ],
        });
    });

    it('should emit compatible reasoning before text while streaming', async () => {
        const reasoningDelta = {
            content: null,
            reasoning_content: 'thinking',
        };
        const events = await collectEvents(
            transformStream(
                toAsyncIterable([
                    asChunk({
                        choices: [
                            {
                                index: 0,
                                finish_reason: null,
                                delta: reasoningDelta,
                            },
                        ],
                    }),
                    asChunk({
                        choices: [
                            {
                                index: 0,
                                finish_reason: null,
                                delta: { content: 'answer' },
                            },
                        ],
                    }),
                    asChunk({
                        choices: [
                            {
                                index: 0,
                                finish_reason: 'stop',
                                delta: {},
                            },
                        ],
                    }),
                ]),
                { compatibility: true }
            )
        );

        expect(events.map((event) => event.type)).toEqual([
            'reasoning-start',
            'reasoning-delta',
            'reasoning-end',
            'text-start',
            'text-delta',
            'text-end',
            'finish',
        ]);
    });

    it('should emit a compatible reasoning-only stream using the fallback field', async () => {
        const reasoningDelta = {
            content: null,
            reasoning: 'deep in thought',
        };
        const events = await collectEvents(
            transformStream(
                toAsyncIterable([
                    asChunk({
                        choices: [
                            {
                                index: 0,
                                finish_reason: null,
                                delta: reasoningDelta,
                            },
                        ],
                    }),
                    asChunk({
                        choices: [
                            {
                                index: 0,
                                finish_reason: 'length',
                                delta: {},
                            },
                        ],
                    }),
                ]),
                { compatibility: true }
            )
        );

        expect(events.map((event) => event.type)).toEqual([
            'reasoning-start',
            'reasoning-delta',
            'reasoning-end',
            'finish',
        ]);
        expect(events.at(-1)).toMatchObject({
            type: 'finish',
            finishReason: 'length',
        });
    });

    it('should keep text and compatible reasoning segments from overlapping', async () => {
        const reasoningDelta = {
            content: null,
            reasoning_content: 'reconsidering',
        };
        const events = await collectEvents(
            transformStream(
                toAsyncIterable([
                    asChunk({
                        choices: [
                            {
                                index: 0,
                                finish_reason: null,
                                delta: { content: 'initial answer' },
                            },
                        ],
                    }),
                    asChunk({
                        choices: [
                            {
                                index: 0,
                                finish_reason: null,
                                delta: reasoningDelta,
                            },
                        ],
                    }),
                    asChunk({
                        choices: [
                            {
                                index: 0,
                                finish_reason: 'stop',
                                delta: {},
                            },
                        ],
                    }),
                ]),
                { compatibility: true }
            )
        );

        expect(events.map((event) => event.type)).toEqual([
            'text-start',
            'text-delta',
            'text-end',
            'reasoning-start',
            'reasoning-delta',
            'reasoning-end',
            'finish',
        ]);
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

function asChunk(value: Partial<ChatCompletionChunk>): ChatCompletionChunk {
    return {
        id: 'chunk-1',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-5-mini',
        choices: [],
        ...value,
    };
}

async function* toAsyncIterable<T>(values: T[]): AsyncIterable<T> {
    yield* values;
}

async function collectEvents<T>(stream: AsyncIterable<T>): Promise<T[]> {
    const events: T[] = [];
    for await (const event of stream) {
        events.push(event);
    }
    return events;
}
