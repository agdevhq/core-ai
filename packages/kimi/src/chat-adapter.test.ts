import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    convertMessages,
    createGenerateRequest,
    createStreamRequest,
    createStructuredOutputOptions,
    mapGenerateResponse,
    transformStream,
} from './chat-adapter.ts';
import { ValidationError, type Message } from '@core-ai/core-ai';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions/completions';
import { toAsyncIterable } from '@core-ai/testing';

type KimiMessage = ChatCompletion['choices'][number]['message'] & {
    reasoning_content?: string;
};

type KimiDelta = NonNullable<ChatCompletionChunk['choices'][number]>['delta'] & {
    reasoning_content?: string;
};

describe('convertMessages', () => {
    it('should round-trip Kimi reasoning via reasoning_content', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'reasoning',
                        text: 'Let me think...',
                        providerMetadata: { kimi: {} },
                    },
                    {
                        type: 'text',
                        text: 'Final answer',
                    },
                ],
            },
        ];

        expect(convertMessages(messages)).toEqual([
            {
                role: 'assistant',
                reasoning_content: 'Let me think...',
                content: 'Final answer',
            },
        ]);
    });

    it('should fold cross-provider reasoning into thinking tags', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'reasoning',
                        text: 'Anthropic thought',
                        providerMetadata: { anthropic: { signature: 'sig' } },
                    },
                    {
                        type: 'text',
                        text: 'Answer',
                    },
                ],
            },
        ];

        expect(convertMessages(messages)).toEqual([
            {
                role: 'assistant',
                content: '<thinking>Anthropic thought</thinking>\n\nAnswer',
            },
        ]);
    });

    it('should preserve reasoning_content alongside tool calls', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'reasoning',
                        text: 'Need to search',
                        providerMetadata: { kimi: {} },
                    },
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
                reasoning_content: 'Need to search',
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
});

describe('createGenerateRequest', () => {
    it('should omit fixed sampling params for kimi-k2.7-code', () => {
        const request = createGenerateRequest('kimi-k2.7-code', {
            messages: [{ role: 'user', content: 'Hi' }],
            maxTokens: 32768,
        });

        expect(request).toMatchObject({
            model: 'kimi-k2.7-code',
            max_tokens: 32768,
        });
        expect(request).not.toHaveProperty('temperature');
        expect(request).not.toHaveProperty('top_p');
        expect(request).not.toHaveProperty('reasoning_effort');
    });

    it('should reject unsupported temperature overrides', () => {
        expect(() =>
            createGenerateRequest('kimi-k2.7-code', {
                messages: [{ role: 'user', content: 'Hi' }],
                temperature: 0.2,
            })
        ).toThrowError(ValidationError);
    });

    it('should reject unsupported topP overrides', () => {
        expect(() =>
            createGenerateRequest('kimi-k2.7-code', {
                messages: [{ role: 'user', content: 'Hi' }],
                topP: 1,
            })
        ).toThrowError(ValidationError);
    });

    it('should reject forced tool choice on always-on thinking models', () => {
        expect(() =>
            createGenerateRequest('kimi-k2.7-code', {
                messages: [{ role: 'user', content: 'Hi' }],
                tools: {
                    get_weather: {
                        name: 'get_weather',
                        description: 'Get weather',
                        parameters: z.object({ city: z.string() }),
                    },
                },
                toolChoice: { type: 'tool', toolName: 'get_weather' },
            })
        ).toThrowError(ValidationError);
    });

    it('should map JSON mode provider option', () => {
        const request = createGenerateRequest('kimi-k2.7-code', {
            messages: [{ role: 'user', content: 'Return JSON' }],
            providerOptions: {
                kimi: {
                    responseFormat: { type: 'json_object' },
                },
            },
        });

        expect(request).toMatchObject({
            response_format: { type: 'json_object' },
        });
    });

    it('should include stream options for streaming requests', () => {
        const request = createStreamRequest('kimi-k2.7-code', {
            messages: [{ role: 'user', content: 'Hi' }],
        });

        expect(request).toMatchObject({
            stream: true,
            stream_options: {
                include_usage: true,
            },
        });
    });
});

describe('createStructuredOutputOptions', () => {
    it('should use Kimi JSON mode instead of forced tool choice', () => {
        const result = createStructuredOutputOptions({
            messages: [{ role: 'user', content: 'Return weather JSON' }],
            schema: z.object({
                city: z.string(),
                temperatureC: z.number(),
            }),
            schemaName: 'weather_schema',
        });

        expect(result).toMatchObject({
            providerOptions: {
                kimi: {
                    responseFormat: { type: 'json_object' },
                },
            },
        });
        expect(result.tools).toBeUndefined();
        expect(result.toolChoice).toBeUndefined();
        expect(result.messages[0]).toMatchObject({
            role: 'system',
            content: expect.stringContaining('weather_schema'),
        });
    });
});

describe('mapGenerateResponse', () => {
    it('should map reasoning_content into reasoning parts', () => {
        const response = asChatCompletion({
            choices: [
                {
                    index: 0,
                    finish_reason: 'stop',
                    logprobs: null,
                    message: {
                        role: 'assistant',
                        content: 'Final answer',
                        refusal: null,
                        reasoning_content: 'Thinking step',
                    } as KimiMessage,
                },
            ],
            usage: {
                prompt_tokens: 10,
                completion_tokens: 20,
                total_tokens: 30,
                completion_tokens_details: {
                    reasoning_tokens: 12,
                },
            },
        });

        const result = mapGenerateResponse(response);

        expect(result.reasoning).toBe('Thinking step');
        expect(result.content).toBe('Final answer');
        expect(result.parts).toEqual([
            {
                type: 'reasoning',
                text: 'Thinking step',
                providerMetadata: { kimi: {} },
            },
            {
                type: 'text',
                text: 'Final answer',
            },
        ]);
        expect(result.usage.outputTokenDetails.reasoningTokens).toBe(12);
    });
});

describe('transformStream', () => {
    it('should emit reasoning events before text deltas', async () => {
        const events = await collectStreamEvents(
            transformStream(
                toAsyncIterable([
                    asChunk({
                        choices: [
                            {
                                index: 0,
                                finish_reason: null,
                                delta: {
                                    reasoning_content: 'Think ',
                                } as KimiDelta,
                            },
                        ],
                    }),
                    asChunk({
                        choices: [
                            {
                                index: 0,
                                finish_reason: null,
                                delta: {
                                    reasoning_content: 'more',
                                } as KimiDelta,
                            },
                        ],
                    }),
                    asChunk({
                        choices: [
                            {
                                index: 0,
                                finish_reason: 'stop',
                                delta: {
                                    content: 'Answer',
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 5,
                            completion_tokens: 3,
                            total_tokens: 8,
                        },
                    }),
                ])
            )
        );

        expect(events.map((event) => event.type)).toEqual([
            'reasoning-start',
            'reasoning-delta',
            'reasoning-delta',
            'reasoning-end',
            'text-start',
            'text-delta',
            'text-end',
            'finish',
        ]);
    });
});

async function collectStreamEvents(
    stream: AsyncIterable<{ type: string }>
): Promise<Array<{ type: string }>> {
    const events: Array<{ type: string }> = [];
    for await (const event of stream) {
        events.push(event);
    }
    return events;
}

function asChatCompletion(value: Partial<ChatCompletion>): ChatCompletion {
    return {
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: Date.now(),
        model: 'kimi-k2.7-code',
        choices: [],
        ...value,
    };
}

function asChunk(value: Partial<ChatCompletionChunk>): ChatCompletionChunk {
    return {
        id: 'chunk-1',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'kimi-k2.7-code',
        choices: [],
        ...value,
    };
}
