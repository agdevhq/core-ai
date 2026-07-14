import type { z } from 'zod';
import {
    buildMiddlewareChain,
    normalizeMiddleware,
} from './wrap-model-utils.ts';
import type {
    ChatModel,
    ChatModelMiddleware,
    ChatStream,
    GenerateObjectOptions,
    GenerateObjectResult,
    GenerateOptions,
    GenerateResult,
    ObjectStream,
    StreamObjectOptions,
} from './types.ts';

type GenerateOperation = NonNullable<ChatModelMiddleware['generate']>;
type StreamOperation = NonNullable<ChatModelMiddleware['stream']>;
type GenerateObjectOperation<TSchema extends z.ZodType> = (args: {
    execute: (
        options?: GenerateObjectOptions<TSchema>
    ) => Promise<GenerateObjectResult<TSchema>>;
    options: GenerateObjectOptions<TSchema>;
    model: ChatModel;
}) => Promise<GenerateObjectResult<TSchema>>;
type StreamObjectOperation<TSchema extends z.ZodType> = (args: {
    execute: (
        options?: StreamObjectOptions<TSchema>
    ) => Promise<ObjectStream<TSchema>>;
    options: StreamObjectOptions<TSchema>;
    model: ChatModel;
}) => Promise<ObjectStream<TSchema>>;

export function wrapChatModel(config: {
    model: ChatModel;
    middleware: ChatModelMiddleware | ChatModelMiddleware[];
}): ChatModel {
    const middlewares = normalizeMiddleware(config.middleware);
    const { model } = config;

    const generateOps: GenerateOperation[] = middlewares.flatMap((mw) =>
        mw.generate ? [mw.generate] : []
    );
    const streamOps: StreamOperation[] = middlewares.flatMap((mw) =>
        mw.stream ? [mw.stream] : []
    );

    return {
        provider: model.provider,
        modelId: model.modelId,
        capabilities: model.capabilities,
        generate(options: GenerateOptions): Promise<GenerateResult> {
            return buildMiddlewareChain({
                model,
                operations: generateOps,
                finalExecute: (opts) => model.generate(opts),
            })(options);
        },
        stream(options: GenerateOptions): Promise<ChatStream> {
            return buildMiddlewareChain({
                model,
                operations: streamOps,
                finalExecute: (opts) => model.stream(opts),
            })(options);
        },
        generateObject<TSchema extends z.ZodType>(
            options: GenerateObjectOptions<TSchema>
        ): Promise<GenerateObjectResult<TSchema>> {
            const operations: GenerateObjectOperation<TSchema>[] =
                middlewares.flatMap((mw) =>
                    mw.generateObject
                        ? [
                              mw.generateObject as GenerateObjectOperation<TSchema>,
                          ]
                        : []
                );

            return buildMiddlewareChain({
                model,
                operations,
                finalExecute: (opts) => model.generateObject(opts),
            })(options);
        },
        streamObject<TSchema extends z.ZodType>(
            options: StreamObjectOptions<TSchema>
        ): Promise<ObjectStream<TSchema>> {
            const operations: StreamObjectOperation<TSchema>[] =
                middlewares.flatMap((mw) =>
                    mw.streamObject
                        ? [mw.streamObject as StreamObjectOperation<TSchema>]
                        : []
                );

            return buildMiddlewareChain({
                model,
                operations,
                finalExecute: (opts) => model.streamObject(opts),
            })(options);
        },
    };
}
