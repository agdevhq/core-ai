import { LLMError } from './errors.ts';
import type { EmbeddingModel, EmbedOptions, EmbedResult } from './types.ts';

export type EmbedParams = EmbedOptions & {
    model: EmbeddingModel;
};

export async function embed(params: EmbedParams): Promise<EmbedResult> {
    const { input } = params;

    if (typeof input === 'string' && input.length === 0) {
        throw new LLMError('input must not be empty');
    }

    if (Array.isArray(input) && input.length === 0) {
        throw new LLMError('input must not be empty');
    }

    const { model, ...options } = params;
    return model.embed(options);
}
