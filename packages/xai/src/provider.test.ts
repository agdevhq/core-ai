import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '@core-ai/core-ai';
import type { XAIChatClient } from './chat-model.ts';
import { createXAI } from './provider.ts';

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

describe('createXAI', () => {
    beforeEach(() => {
        chatCreate.mockReset();
    });

    it('should throw when apiKey is not provided', () => {
        expect(() => createXAI()).toThrow('createXAI: apiKey is required.');
        expect(() => createXAI({})).toThrow('createXAI: apiKey is required.');
    });

    it('should create a chat model with provider xai', () => {
        const provider = createXAI({ apiKey: 'test-key' });

        const chatModel = provider.chatModel('grok-4.3');

        expect(chatModel.provider).toBe('xai');
        expect(chatModel.modelId).toBe('grok-4.3');
    });

    it('should call the underlying OpenAI-compatible client', async () => {
        chatCreate.mockResolvedValue({
            id: 'chatcmpl-1',
            object: 'chat.completion',
            created: Date.now(),
            model: 'grok-4.3',
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

        const provider = createXAI({ apiKey: 'test-key' });

        await provider
            .chatModel('grok-4.3')
            .generate({ messages: [{ role: 'user', content: 'hello' }] });

        expect(chatCreate).toHaveBeenCalledTimes(1);
    });

    it('should accept a narrow injected client', async () => {
        chatCreate.mockResolvedValue({
            id: 'chatcmpl-injected',
            object: 'chat.completion',
            created: Date.now(),
            model: 'grok-4.3',
            choices: [
                {
                    index: 0,
                    finish_reason: 'stop',
                    logprobs: null,
                    message: {
                        role: 'assistant',
                        content: 'injected',
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

        const client: XAIChatClient = {
            chat: {
                completions: {
                    create: chatCreate,
                },
            },
        };
        const provider = createXAI({ client });

        const result = await provider
            .chatModel('grok-4.3')
            .generate({ messages: [{ role: 'user', content: 'hello' }] });

        expect(result.content).toBe('injected');
        expect(chatCreate).toHaveBeenCalledTimes(1);
    });

    it('should tag errors with provider "xai"', async () => {
        chatCreate.mockRejectedValue(new Error('upstream failure'));

        const provider = createXAI({ apiKey: 'test-key' });

        const error = await provider
            .chatModel('grok-4.3')
            .generate({ messages: [{ role: 'user', content: 'hello' }] })
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).provider).toBe('xai');
    });
});
