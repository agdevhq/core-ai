import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { createOpenAICompat } from './provider.js';

describe('createOpenAICompat', () => {
    it('should expose all model factories', () => {
        const provider = createOpenAICompat({
            client: createMockClient(),
        });

        const chatModel = provider.chatModel('gpt-5-mini');
        const embeddingModel = provider.embeddingModel(
            'text-embedding-3-small'
        );
        const imageModel = provider.imageModel('gpt-image-1');

        expect(chatModel.provider).toBe('openai');
        expect(chatModel.modelId).toBe('gpt-5-mini');

        expect(embeddingModel.provider).toBe('openai');
        expect(embeddingModel.modelId).toBe('text-embedding-3-small');

        expect(imageModel.provider).toBe('openai');
        expect(imageModel.modelId).toBe('gpt-image-1');
    });

    it('should use a shared client instance across model types', async () => {
        const chatCreate = vi.fn(async () => ({
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
                    },
                },
            ],
            usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
            },
        }));
        const embeddingCreate = vi.fn(async () => ({
            data: [{ embedding: [0.1], index: 0 }],
            usage: { prompt_tokens: 1, total_tokens: 1 },
        }));
        const imageGenerate = vi.fn(async () => ({
            data: [{ b64_json: 'abc' }],
        }));

        const provider = createOpenAICompat({
            client: createMockClient({
                chatCreate,
                embeddingCreate,
                imageGenerate,
            }),
        });

        await provider
            .chatModel('gpt-5-mini')
            .generate({ messages: [{ role: 'user', content: 'hello' }] });
        await provider
            .embeddingModel('text-embedding-3-small')
            .embed({ input: 'hello' });
        await provider.imageModel('gpt-image-1').generate({ prompt: 'cat' });

        expect(chatCreate).toHaveBeenCalledTimes(1);
        expect(embeddingCreate).toHaveBeenCalledTimes(1);
        expect(imageGenerate).toHaveBeenCalledTimes(1);
    });
});

function createMockClient(overrides?: {
    chatCreate?: (options: unknown) => Promise<unknown>;
    embeddingCreate?: (options: unknown) => Promise<unknown>;
    imageGenerate?: (options: unknown) => Promise<unknown>;
}): OpenAI {
    const chatCreate =
        overrides?.chatCreate ??
        (async () => {
            throw new Error('chat create not implemented');
        });
    const embeddingCreate =
        overrides?.embeddingCreate ??
        (async () => {
            throw new Error('embedding create not implemented');
        });
    const imageGenerate =
        overrides?.imageGenerate ??
        (async () => {
            throw new Error('image generate not implemented');
        });

    return {
        chat: {
            completions: {
                create: chatCreate,
            },
        },
        embeddings: {
            create: embeddingCreate,
        },
        images: {
            generate: imageGenerate,
        },
    } as unknown as OpenAI;
}
