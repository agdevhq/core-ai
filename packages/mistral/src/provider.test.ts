import type { Mistral } from '@mistralai/mistralai';
import { describe, expect, it, vi } from 'vitest';
import { createMistral } from './provider.js';

describe('createMistral', () => {
    it('should expose all model factories', () => {
        const provider = createMistral({
            client: createMockClient(),
        });

        const chatModel = provider.chatModel('mistral-large-latest');
        const embeddingModel = provider.embeddingModel('mistral-embed');

        expect(chatModel.provider).toBe('mistral');
        expect(chatModel.modelId).toBe('mistral-large-latest');

        expect(embeddingModel.provider).toBe('mistral');
        expect(embeddingModel.modelId).toBe('mistral-embed');
    });

    it('should use a shared client instance across model types', async () => {
        const complete = vi.fn(async () => ({
            id: 'chatcmpl-1',
            object: 'chat.completion',
            model: 'mistral-large-latest',
            created: Date.now(),
            usage: {
                promptTokens: 1,
                completionTokens: 1,
                totalTokens: 2,
            },
            choices: [
                {
                    index: 0,
                    finishReason: 'stop',
                    message: {
                        role: 'assistant',
                        content: 'ok',
                    },
                },
            ],
        }));
        const createEmbedding = vi.fn(async () => ({
            id: 'embed-1',
            object: 'list',
            model: 'mistral-embed',
            usage: {
                promptTokens: 1,
                totalTokens: 1,
            },
            data: [{ embedding: [0.1], index: 0 }],
        }));

        const provider = createMistral({
            client: createMockClient({
                complete,
                createEmbedding,
            }),
        });

        await provider
            .chatModel('mistral-large-latest')
            .generate({ messages: [{ role: 'user', content: 'hello' }] });
        await provider.embeddingModel('mistral-embed').embed({ input: 'hello' });

        expect(complete).toHaveBeenCalledTimes(1);
        expect(createEmbedding).toHaveBeenCalledTimes(1);
    });
});

function createMockClient(overrides?: {
    complete?: (options: unknown) => Promise<unknown>;
    stream?: (options: unknown) => Promise<unknown>;
    createEmbedding?: (options: unknown) => Promise<unknown>;
}): Mistral {
    const complete =
        overrides?.complete ??
        (async () => {
            throw new Error('chat complete not implemented');
        });
    const stream =
        overrides?.stream ??
        (async () => {
            throw new Error('chat stream not implemented');
        });
    const createEmbedding =
        overrides?.createEmbedding ??
        (async () => {
            throw new Error('embedding create not implemented');
        });

    return {
        chat: {
            complete,
            stream,
        },
        embeddings: {
            create: createEmbedding,
        },
    } as unknown as Mistral;
}
