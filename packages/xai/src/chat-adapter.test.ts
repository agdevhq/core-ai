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

type XAIMessage = ChatCompletion['choices'][number]['message'] & {
    reasoning_content?: string;
};

type XAIDelta = NonNullable<ChatCompletionChunk['choices'][number]>['delta'] & {
    reasoning_content?: string;
};

describe('convertMessages', () => {
    it('should round-trip xAI reasoning via reasoning_content', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'reasoning',
                        text: 'Let me think...',
                        providerMetadata: { xai: {} },
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
                        providerMetadata: { xai: {} },
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
    it('should map reasoning effort for grok-4.3', () => {
        const request = createGenerateRequest('grok-4.3', {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'high' },
        });

        expect(request).toMatchObject({
            model: 'grok-4.3',
            reasoning_effort: 'high',
        });
    });

    it('should map minimal reasoning effort to none', () => {
        const request = createGenerateRequest('grok-4.3', {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'minimal' },
        });

        expect(request).toMatchObject({
            reasoning_effort: 'none',
        });
    });

    it('should reject stop sequences on reasoning models', () => {
        expect(() =>
            createGenerateRequest('grok-4.3', {
                messages: [{ role: 'user', content: 'Hi' }],
                providerOptions: {
                    xai: {
                        stopSequences: ['END'],
                    },
                },
            })
        ).toThrowError(ValidationError);
    });

    it('should allow stop sequences on non-reasoning models', () => {
        const request = createGenerateRequest('grok-4.20-0309-non-reasoning', {
            messages: [{ role: 'user', content: 'Hi' }],
            providerOptions: {
                xai: {
                    stopSequences: ['END'],
                },
            },
        });

        expect(request).toMatchObject({
            stop: ['END'],
        });
    });

    it('should map JSON mode provider option', () => {
        const request = createGenerateRequest('grok-4.3', {
            messages: [{ role: 'user', content: 'Return JSON' }],
            providerOptions: {
                xai: {
                    responseFormat: { type: 'json_object' },
                },
            },
        });

        expect(request).toMatchObject({
            response_format: { type: 'json_object' },
        });
    });

    it('should include stream options for streaming requests', () => {
        const request = createStreamRequest('grok-4.3', {
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
    it('should use native JSON Schema for supported models', () => {
        const result = createStructuredOutputOptions('grok-4.3', {
            messages: [{ role: 'user', content: 'Return weather JSON' }],
            schema: z.object({
                city: z.string(),
                temperatureC: z.number(),
            }),
            schemaName: 'weather_schema',
            schemaDescription: 'Structured weather output',
        });

        expect(result).toMatchObject({
            providerOptions: {
                xai: {
                    responseFormat: {
                        type: 'json_schema',
                        json_schema: {
                            name: 'weather_schema',
                            description: 'Structured weather output',
                            strict: true,
                        },
                    },
                },
            },
        });
        expect(result.tools).toBeUndefined();
        expect(result.toolChoice).toBeUndefined();
        expect(result.messages).toEqual([
            { role: 'user', content: 'Return weather JSON' },
        ]);
    });

    it('should fall back to JSON mode for unknown models', () => {
        const result = createStructuredOutputOptions('custom-xai-model', {
            messages: [{ role: 'user', content: 'Return weather JSON' }],
            schema: z.object({
                city: z.string(),
            }),
            schemaName: 'weather_schema',
        });

        expect(result).toMatchObject({
            providerOptions: {
                xai: {
                    responseFormat: { type: 'json_object' },
                },
            },
        });
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
                    } as XAIMessage,
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
                providerMetadata: { xai: {} },
            },
            {
                type: 'text',
                text: 'Final answer',
            },
        ]);
        expect(result.usage.outputTokenDetails.reasoningTokens).toBe(12);
        expect(result.usage.outputTokens).toBe(32);
    });

    it('should include reasoning tokens in total output tokens', () => {
        const response = asChatCompletion({
            choices: [
                {
                    index: 0,
                    finish_reason: 'stop',
                    logprobs: null,
                    message: {
                        role: 'assistant',
                        content: 'Answer',
                        refusal: null,
                    },
                },
            ],
            usage: {
                prompt_tokens: 10,
                completion_tokens: 39,
                total_tokens: 207,
                completion_tokens_details: {
                    reasoning_tokens: 158,
                },
            },
        });

        const result = mapGenerateResponse(response);

        expect(result.usage.outputTokens).toBe(197);
        expect(result.usage.outputTokenDetails.reasoningTokens).toBe(158);
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
                                } as XAIDelta,
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
                                } as XAIDelta,
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
        model: 'grok-4.3',
        choices: [],
        ...value,
    };
}

function asChunk(value: Partial<ChatCompletionChunk>): ChatCompletionChunk {
    return {
        id: 'chunk-1',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'grok-4.3',
        choices: [],
        ...value,
    };
}
