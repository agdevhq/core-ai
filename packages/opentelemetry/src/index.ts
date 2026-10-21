import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';
import type {
    ChatModel,
    ChatModelMiddleware,
    EmbeddingModelMiddleware,
    GenerateObjectOptions,
    GenerateObjectResult,
    ImageModelMiddleware,
    ObjectStream,
    StreamObjectOptions,
    SchemaInput,
} from '@core-ai/core-ai';
import {
    createChatSpanName,
    createEmbedSpanName,
    createImageSpanName,
    getDeclaredTools,
    setChatInputAttributes,
    setChatOutputAttributes,
    setChatRequestAttributes,
    setChatUsageAttributes,
    setEmbedInputAttributes,
    setEmbedRequestAttributes,
    setEmbedUsageAttributes,
    setFinishReasonAttribute,
    setImageInputAttributes,
    setImageRequestAttributes,
    setObjectOutputAttributes,
} from './attributes.ts';

export type OtelMiddlewareOptions = {
    recordContent?: boolean;
    tracerName?: string;
};

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

function toError(error: unknown): Error {
    if (error instanceof Error) {
        return error;
    }

    return new Error(String(error));
}

function recordError(span: Span, error: unknown): void {
    span.setAttribute(
        'error.type',
        error instanceof Error ? error.name : '_OTHER'
    );
    span.setStatus({
        code: SpanStatusCode.ERROR,
        message: getErrorMessage(error),
    });
    span.recordException(toError(error));
}

export function createOtelMiddleware(
    options: OtelMiddlewareOptions = {}
): ChatModelMiddleware {
    const { recordContent = false, tracerName = 'core-ai' } = options;

    return {
        generate: async ({ execute, options: generateOptions, model }) => {
            const tracer = trace.getTracer(tracerName);

            return tracer.startActiveSpan(
                createChatSpanName(model),
                {
                    kind: SpanKind.CLIENT,
                },
                async (span) => {
                    setChatRequestAttributes(
                        span,
                        model,
                        generateOptions,
                        'text'
                    );

                    try {
                        // Inside the try: converting a tool schema can throw.
                        if (recordContent) {
                            setChatInputAttributes(
                                span,
                                generateOptions.messages,
                                getDeclaredTools(model, generateOptions)
                            );
                        }

                        const result = await execute();
                        setChatUsageAttributes(span, result.usage);
                        setFinishReasonAttribute(span, result.finishReason);

                        if (recordContent) {
                            setChatOutputAttributes(span, result);
                        }

                        span.setStatus({
                            code: SpanStatusCode.OK,
                        });
                        return result;
                    } catch (error) {
                        recordError(span, error);
                        throw error;
                    } finally {
                        span.end();
                    }
                }
            );
        },
        stream: async ({ execute, options: generateOptions, model }) => {
            const tracer = trace.getTracer(tracerName);

            return tracer.startActiveSpan(
                createChatSpanName(model),
                {
                    kind: SpanKind.CLIENT,
                },
                async (span) => {
                    setChatRequestAttributes(
                        span,
                        model,
                        generateOptions,
                        'text'
                    );

                    try {
                        // Inside the try: converting a tool schema can throw.
                        if (recordContent) {
                            setChatInputAttributes(
                                span,
                                generateOptions.messages,
                                getDeclaredTools(model, generateOptions)
                            );
                        }

                        const chatStream = await execute();

                        void chatStream.result
                            .then((result) => {
                                setChatUsageAttributes(span, result.usage);
                                setFinishReasonAttribute(
                                    span,
                                    result.finishReason
                                );

                                if (recordContent) {
                                    setChatOutputAttributes(span, result);
                                }

                                span.setStatus({
                                    code: SpanStatusCode.OK,
                                });
                            })
                            .catch((error: unknown) => {
                                recordError(span, error);
                            })
                            .finally(() => {
                                span.end();
                            });

                        return chatStream;
                    } catch (error) {
                        recordError(span, error);
                        span.end();
                        throw error;
                    }
                }
            );
        },
        generateObject: async <TSchema extends SchemaInput>(args: {
            execute: (
                options?: GenerateObjectOptions<TSchema>
            ) => Promise<GenerateObjectResult<TSchema>>;
            options: GenerateObjectOptions<TSchema>;
            model: ChatModel;
        }) => {
            const { execute, options: generateOptions, model } = args;
            const tracer = trace.getTracer(tracerName);

            return tracer.startActiveSpan(
                createChatSpanName(model),
                {
                    kind: SpanKind.CLIENT,
                },
                async (span) => {
                    setChatRequestAttributes(
                        span,
                        model,
                        generateOptions,
                        'json'
                    );

                    if (recordContent) {
                        setChatInputAttributes(span, generateOptions.messages);
                    }

                    try {
                        const result = await execute();
                        setChatUsageAttributes(span, result.usage);
                        setFinishReasonAttribute(span, result.finishReason);

                        if (recordContent) {
                            setObjectOutputAttributes(span, result);
                        }

                        span.setStatus({
                            code: SpanStatusCode.OK,
                        });
                        return result;
                    } catch (error) {
                        recordError(span, error);
                        throw error;
                    } finally {
                        span.end();
                    }
                }
            );
        },
        streamObject: async <TSchema extends SchemaInput>(args: {
            execute: (
                options?: StreamObjectOptions<TSchema>
            ) => Promise<ObjectStream<TSchema>>;
            options: StreamObjectOptions<TSchema>;
            model: ChatModel;
        }) => {
            const { execute, options: generateOptions, model } = args;
            const tracer = trace.getTracer(tracerName);

            return tracer.startActiveSpan(
                createChatSpanName(model),
                {
                    kind: SpanKind.CLIENT,
                },
                async (span) => {
                    setChatRequestAttributes(
                        span,
                        model,
                        generateOptions,
                        'json'
                    );

                    if (recordContent) {
                        setChatInputAttributes(span, generateOptions.messages);
                    }

                    try {
                        const objectStream = await execute();

                        void objectStream.result
                            .then((result) => {
                                setChatUsageAttributes(span, result.usage);
                                setFinishReasonAttribute(
                                    span,
                                    result.finishReason
                                );

                                if (recordContent) {
                                    setObjectOutputAttributes(span, result);
                                }

                                span.setStatus({
                                    code: SpanStatusCode.OK,
                                });
                            })
                            .catch((error: unknown) => {
                                recordError(span, error);
                            })
                            .finally(() => {
                                span.end();
                            });

                        return objectStream;
                    } catch (error) {
                        recordError(span, error);
                        span.end();
                        throw error;
                    }
                }
            );
        },
    };
}

export function createOtelEmbeddingMiddleware(
    options: OtelMiddlewareOptions = {}
): EmbeddingModelMiddleware {
    const { recordContent = false, tracerName = 'core-ai' } = options;

    return {
        embed: async ({ execute, options: embedOptions, model }) => {
            const tracer = trace.getTracer(tracerName);

            return tracer.startActiveSpan(
                createEmbedSpanName(model),
                {
                    kind: SpanKind.CLIENT,
                },
                async (span) => {
                    setEmbedRequestAttributes(span, model, embedOptions);

                    if (recordContent) {
                        setEmbedInputAttributes(span, embedOptions.input);
                    }

                    try {
                        const result = await execute();
                        setEmbedUsageAttributes(span, result.usage);
                        span.setStatus({
                            code: SpanStatusCode.OK,
                        });
                        return result;
                    } catch (error) {
                        recordError(span, error);
                        throw error;
                    } finally {
                        span.end();
                    }
                }
            );
        },
    };
}

export function createOtelImageMiddleware(
    options: OtelMiddlewareOptions = {}
): ImageModelMiddleware {
    const { recordContent = false, tracerName = 'core-ai' } = options;

    return {
        generate: async ({ execute, options: imageOptions, model }) => {
            const tracer = trace.getTracer(tracerName);

            return tracer.startActiveSpan(
                createImageSpanName(model),
                {
                    kind: SpanKind.CLIENT,
                },
                async (span) => {
                    setImageRequestAttributes(span, model, imageOptions);

                    if (recordContent) {
                        setImageInputAttributes(span, imageOptions.prompt);
                    }

                    try {
                        const result = await execute();
                        span.setStatus({
                            code: SpanStatusCode.OK,
                        });
                        return result;
                    } catch (error) {
                        recordError(span, error);
                        throw error;
                    } finally {
                        span.end();
                    }
                }
            );
        },
    };
}
