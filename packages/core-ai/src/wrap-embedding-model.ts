import { buildMiddlewareChain, normalizeMiddleware } from './wrap-model-utils.ts';
import type {
    EmbedOptions,
    EmbedResult,
    EmbeddingModel,
    EmbeddingModelMiddleware,
} from './types.ts';

type EmbedOperation = NonNullable<EmbeddingModelMiddleware['embed']>;

export function wrapEmbeddingModel(config: {
    model: EmbeddingModel;
    middleware: EmbeddingModelMiddleware | EmbeddingModelMiddleware[];
}): EmbeddingModel {
    const middlewares = normalizeMiddleware(config.middleware);
    const { model } = config;

    const embedOps: EmbedOperation[] = middlewares.flatMap((mw) =>
        mw.embed ? [mw.embed] : []
    );

    return {
        provider: model.provider,
        modelId: model.modelId,
        embed(options: EmbedOptions): Promise<EmbedResult> {
            return buildMiddlewareChain({
                model,
                operations: embedOps,
                finalExecute: (opts) => model.embed(opts),
            })(options);
        },
    };
}
