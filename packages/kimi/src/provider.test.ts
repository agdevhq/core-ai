import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '@core-ai/core-ai';
import { createKimi } from './provider.ts';

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

describe('createKimi', () => {
    beforeEach(() => {
        chatCreate.mockReset();
    });

    it('should throw when apiKey is not provided', () => {
        expect(() => createKimi()).toThrow('createKimi: apiKey is required.');
        expect(() => createKimi({})).toThrow('createKimi: apiKey is required.');
    });

    it('should create a chat model with provider kimi', () => {
        const provider = createKimi({ apiKey: 'test-key' });

        const chatModel = provider.chatModel('kimi-k2.7-code');

        expect(chatModel.provider).toBe('kimi');
        expect(chatModel.modelId).toBe('kimi-k2.7-code');
    });

    it('should call the underlying OpenAI-compatible client', async () => {
        chatCreate.mockResolvedValue({
            id: 'chatcmpl-1',
            object: 'chat.completion',
            created: Date.now(),
            model: 'kimi-k2.7-code',
            choices: [
                {
                    index: 0,
                    finish_reason: 'stop',
                    logprobs: null,
                    message: {
                        role: 'assistant',
                        content: 'ok',
                        refusal: null,
                    },
                },
            ],
            usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
            },
        });

        const provider = createKimi({ apiKey: 'test-key' });

        await provider
            .chatModel('kimi-k2.7-code')
            .generate({ messages: [{ role: 'user', content: 'hello' }] });

        expect(chatCreate).toHaveBeenCalledTimes(1);
    });

    it('should tag errors with provider "kimi"', async () => {
        chatCreate.mockRejectedValue(new Error('upstream failure'));

        const provider = createKimi({ apiKey: 'test-key' });

        const error = await provider
            .chatModel('kimi-k2.7-code')
            .generate({ messages: [{ role: 'user', content: 'hello' }] })
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).provider).toBe('kimi');
    });
});
