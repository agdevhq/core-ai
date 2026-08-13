import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '@core-ai/core-ai';
import { createOmnifact } from './provider.js';

const { chatCreate } = vi.hoisted(() => ({ chatCreate: vi.fn() }));

vi.mock('openai', async (importActual) => {
    const actual = await importActual<typeof import('openai')>();
    return {
        ...actual,
        default: class {
            chat = {
                completions: {
                    create: chatCreate,
                },
            };
        },
    };
});

describe('createOmnifact', () => {
    beforeEach(() => {
        chatCreate.mockReset();
    });

    it('should throw when apiKey is not provided', () => {
        expect(() => createOmnifact()).toThrow(
            'createOmnifact: apiKey is required.'
        );
        expect(() => createOmnifact({})).toThrow(
            'createOmnifact: apiKey is required.'
        );
    });

    it('should create a chat model with provider omnifact', () => {
        const provider = createOmnifact({ apiKey: 'test-key' });

        const chatModel = provider.chatModel('gpt-5-mini');

        expect(chatModel.provider).toBe('omnifact');
        expect(chatModel.modelId).toBe('gpt-5-mini');
        expect(chatModel.capabilities.tools.strictSchemas).toEqual({
            supported: true,
        });
    });

    it('should call the underlying OpenAI-compatible client', async () => {
        chatCreate.mockResolvedValue({
            id: 'chatcmpl-1',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-5-mini',
            choices: [
                {
                    index: 0,
                    finish_reason: 'stop',
                    logprobs: null,
                    message: {
                        role: 'assistant',
                        content: 'ok',
                        refusal: null,
                        reasoning_content: 'thinking',
                    },
                },
            ],
            usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
            },
        });

        const provider = createOmnifact({ apiKey: 'test-key' });

        const result = await provider.chatModel('eu/gpt-5-mini').generate({
            messages: [{ role: 'user', content: 'hello' }],
            maxTokens: 128,
        });

        expect(chatCreate).toHaveBeenCalledTimes(1);
        expect(chatCreate.mock.calls[0]?.[0]).toMatchObject({
            max_completion_tokens: 128,
        });
        expect(result.reasoning).toBe('thinking');
    });

    it('should tag errors with provider "omnifact"', async () => {
        chatCreate.mockRejectedValue(new Error('upstream failure'));

        const provider = createOmnifact({ apiKey: 'test-key' });

        const error = await provider
            .chatModel('eu/gpt-5-mini')
            .generate({ messages: [{ role: 'user', content: 'hello' }] })
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).provider).toBe('omnifact');
    });
});
