import { buildMiddlewareChain, normalizeMiddleware } from './wrap-model-utils.ts';
import type {
    ImageGenerateOptions,
    ImageGenerateResult,
    ImageModel,
    ImageModelMiddleware,
} from './types.ts';

type GenerateOperation = NonNullable<ImageModelMiddleware['generate']>;

export function wrapImageModel(config: {
    model: ImageModel;
    middleware: ImageModelMiddleware | ImageModelMiddleware[];
}): ImageModel {
    const middlewares = normalizeMiddleware(config.middleware);
    const { model } = config;

    const generateOps: GenerateOperation[] = middlewares.flatMap((mw) =>
        mw.generate ? [mw.generate] : []
    );

    return {
        provider: model.provider,
        modelId: model.modelId,
        generate(options: ImageGenerateOptions): Promise<ImageGenerateResult> {
            return buildMiddlewareChain({
                model,
                operations: generateOps,
                finalExecute: (opts) => model.generate(opts),
            })(options);
        },
    };
}
