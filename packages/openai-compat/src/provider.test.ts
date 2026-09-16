import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
    createOpenAICompat,
    type OpenAICompatProviderOptions,
} from './provider.js';

describe('createOpenAICompat', () => {
    it('should expose only compatibility-enabled Chat Completions models', async () => {
        const create = vi.fn(async () => ({
            id: 'chatcmpl-1',
            object: 'chat.completion',
            created: Date.now(),
            model: 'qwen3-235b',
            choices: [
                {
                    index: 0,
                    finish_reason: 'stop',
                    logprobs: null,
                    message: {
                        role: 'assistant',
                        content: 'answer',
                        refusal: null,
                        reasoning_content: 'thinking',
                    },
                },
            ],
            usage: {
                prompt_tokens: 1,
                completion_tokens: 2,
                total_tokens: 3,
            },
        }));
        const client = {
            chat: {
                completions: { create },
            },
        } as unknown as NonNullable<OpenAICompatProviderOptions['client']>;
        const provider = createOpenAICompat({ client });

        expect(Object.keys(provider)).toEqual(['chatModel']);

        const model = provider.chatModel('qwen3-235b');
        const result = await model.generate({
            messages: [{ role: 'user', content: 'hello' }],
        });

        expect(model.provider).toBe('openai-compat');
        expect(result.reasoning).toBe('thinking');
        expect(result.content).toBe('answer');
    });

    it('should allow nonstandard reasoning extraction to be disabled', async () => {
        const create = vi.fn(async () =>
            createChatCompletion({
                content: 'answer',
                reasoning_content: 'thinking',
            })
        );
        const provider = createOpenAICompat({
            client: createMockClient(create),
            reasoning: false,
        });

        const result = await provider.chatModel('qwen3-235b').generate({
            messages: [{ role: 'user', content: 'hello' }],
        });

        expect(result.reasoning).toBeNull();
        expect(result.parts).toEqual([{ type: 'text', text: 'answer' }]);
    });

    it('should select the max tokens parameter and allow a provider default', async () => {
        const create = vi.fn(async (_request: unknown) =>
            createChatCompletion({ content: 'answer' })
        );
        const provider = createOpenAICompat({
            client: createMockClient(create),
        });
        const providerWithDefault = createOpenAICompat({
            client: createMockClient(create),
            maxTokensParameter: 'max_completion_tokens',
        });
        const messages = [{ role: 'user' as const, content: 'hello' }];

        await provider
            .chatModel('gpt-5-mini')
            .generate({ messages, maxTokens: 128 });
        await provider
            .chatModel('qwen3-235b')
            .generate({ messages, maxTokens: 128 });
        await providerWithDefault.chatModel('custom-reasoning-model').generate({
            messages,
            maxTokens: 128,
        });

        expect(create.mock.calls[0]?.[0]).toMatchObject({
            max_completion_tokens: 128,
        });
        expect(create.mock.calls[1]?.[0]).toMatchObject({
            max_tokens: 128,
        });
        expect(create.mock.calls[2]?.[0]).toMatchObject({
            max_completion_tokens: 128,
        });
    });

    it('should use tool-based structured output by default', async () => {
        const create = vi.fn(async (_request: unknown) =>
            createChatCompletion({
                content: null,
                tool_calls: [
                    {
                        id: 'tc_1',
                        type: 'function',
                        function: {
                            name: 'result',
                            arguments: '{"value":"ok"}',
                        },
                    },
                ],
            })
        );
        const provider = createOpenAICompat({
            client: createMockClient(create),
        });

        await provider.chatModel('qwen3-235b').generateObject({
            messages: [{ role: 'user', content: 'Return an object' }],
            schema: z.object({ value: z.string() }),
            schemaName: 'result',
        });

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                tool_choice: {
                    type: 'function',
                    function: { name: 'result' },
                },
            }),
            expect.anything()
        );
        expect(create.mock.calls[0]?.[0]).not.toHaveProperty('response_format');
    });

    it('should support native structured output when configured', async () => {
        const create = vi.fn(async (_request: unknown) =>
            createChatCompletion({
                content: '{"value":"ok"}',
            })
        );
        const provider = createOpenAICompat({
            client: createMockClient(create),
            structuredOutputMode: 'json-schema',
        });

        await provider.chatModel('qwen3-235b').generateObject({
            messages: [{ role: 'user', content: 'Return an object' }],
            schema: z.object({ value: z.string() }),
            schemaName: 'result',
        });

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                response_format: {
                    type: 'json_schema',
                    json_schema: expect.objectContaining({
                        name: 'result',
                        strict: true,
                    }),
                },
            }),
            expect.anything()
        );
        expect(create.mock.calls[0]?.[0]).not.toHaveProperty('tools');
    });

    it('should forward strict tools optimistically', async () => {
        const create = vi.fn(async (_request: unknown) =>
            createChatCompletion({ content: 'answer' })
        );
        const model = createOpenAICompat({
            client: createMockClient(create),
        }).chatModel('custom-model');

        expect(model.capabilities.tools.strictSchemas).toEqual({
            supported: true,
        });

        await model.generate({
            messages: [{ role: 'user', content: 'hello' }],
            tools: {
                search: {
                    name: 'search',
                    description: 'Search',
                    parameters: z.object({
                        query: z.string(),
                        limit: z.number().nullable(),
                    }),
                    strict: true,
                },
            },
        });

        expect(create.mock.calls[0]?.[0]).toMatchObject({
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'search',
                        strict: true,
                        parameters: {
                            required: ['query', 'limit'],
                            additionalProperties: false,
                        },
                    },
                },
            ],
        });
    });
});

function createMockClient(
    create: (request: unknown) => Promise<unknown>
): NonNullable<OpenAICompatProviderOptions['client']> {
    return {
        chat: {
            completions: { create },
        },
    } as unknown as NonNullable<OpenAICompatProviderOptions['client']>;
}

function createChatCompletion(message: Record<string, unknown>) {
    return {
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: Date.now(),
        model: 'qwen3-235b',
        choices: [
            {
                index: 0,
                finish_reason: message['tool_calls'] ? 'tool_calls' : 'stop',
                logprobs: null,
                message: {
                    role: 'assistant',
                    refusal: null,
                    ...message,
                },
            },
        ],
        usage: {
            prompt_tokens: 1,
            completion_tokens: 2,
            total_tokens: 3,
        },
    };
}
