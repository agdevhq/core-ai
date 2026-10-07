import { describe, expect, it, vi } from 'vitest';
import { wrapEmbeddingModel } from './wrap-embedding-model.ts';
import type { EmbedResult, EmbeddingModel } from './types.ts';

function createEmbedResult(value: number): EmbedResult {
    return {
        embeddings: [[value]],
        usage: {
            inputTokens: 1,
        },
    };
}

describe('wrapEmbeddingModel', () => {
    it('passes through to the original model when no hooks are defined', async () => {
        const embedMock = vi.fn<EmbeddingModel['embed']>(async () => createEmbedResult(1));
        const model: EmbeddingModel = {
            provider: 'test',
            modelId: 'embed-model',
            embed: embedMock,
        };
        const wrapped = wrapEmbeddingModel({
            model,
            middleware: {},
        });

        await expect(
            wrapped.embed({
                input: 'hello',
            })
        ).resolves.toEqual(createEmbedResult(1));
        expect(embedMock).toHaveBeenCalledWith({
            input: 'hello',
        });
    });

    it('allows embed middleware to modify options and results', async () => {
        const embedMock = vi.fn<EmbeddingModel['embed']>(async (options) =>
            createEmbedResult(typeof options.input === 'string' ? options.input.length : 0)
        );
        const model: EmbeddingModel = {
            provider: 'test',
            modelId: 'embed-model',
            embed: embedMock,
        };
        const wrapped = wrapEmbeddingModel({
            model,
            middleware: {
                embed: async ({ execute, options }) => {
                    const result = await execute({
                        ...options,
                        input: 'rewritten',
                    });

                    return {
                        ...result,
                        embeddings: result.embeddings.map((embedding) =>
                            embedding.map((value) => value + 1)
                        ),
                    };
                },
            },
        });

        await expect(
            wrapped.embed({
                input: 'hello',
            })
        ).resolves.toEqual({
            embeddings: [[10]],
            usage: { inputTokens: 1 },
        });
        expect(embedMock).toHaveBeenCalledWith({
            input: 'rewritten',
        });
    });
});
