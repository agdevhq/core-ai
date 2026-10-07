import { assertNonEmptyEmbedInput } from './assertions.ts';
import { callModelWithOptions } from './model-options.ts';
import type { EmbeddingModel, EmbedOptions, EmbedResult } from './types.ts';

export type EmbedParams = EmbedOptions & {
    model: EmbeddingModel;
};

export async function embed(params: EmbedParams): Promise<EmbedResult> {
    assertNonEmptyEmbedInput(params.input);

    return callModelWithOptions(params, (model, options) => model.embed(options));
}
