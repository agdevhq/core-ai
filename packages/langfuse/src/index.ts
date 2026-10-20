import { startActiveObservation } from '@langfuse/tracing';
import type { LangfuseEmbedding, LangfuseGeneration } from '@langfuse/tracing';
import type {
    ChatModel,
    ChatModelMiddleware,
    ChatUsage,
    EmbedOptions,
    EmbeddingModel,
    EmbeddingModelMiddleware,
    EmbeddingUsage,
    GenerateObjectOptions,
    GenerateObjectResult,
    GenerateOptions,
    GenerateResult,
    ImageGenerateOptions,
    ImageGenerateResult,
    ImageModel,
    ImageModelMiddleware,
    ObjectStream,
    StreamObjectOptions,
    SchemaInput,
} from '@core-ai/core-ai';

type TraceObservation = LangfuseGeneration | LangfuseEmbedding;
type ObservationAttributes = Record<string, unknown>;

export type LangfuseMiddlewareOptions = {
    recordContent?: boolean;
};

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

function compactRecord(record: ObservationAttributes): ObservationAttributes | undefined {
    const entries = Object.entries(record).filter(
        ([, value]) => value !== undefined && value !== null
    );

    if (entries.length === 0) {
        return undefined;
    }

    return Object.fromEntries(entries);
}

function createChatObservationName(model: ChatModel): string {
    return `chat ${model.modelId}`;
}

function createEmbeddingObservationName(model: EmbeddingModel): string {
    return `embeddings ${model.modelId}`;
}

function createImageObservationName(model: ImageModel): string {
    return `image_generation ${model.modelId}`;
}

function createObservationAttributes(config: {
    modelId: string;
    modelParameters?: ObservationAttributes;
    metadata?: Record<string, unknown>;
    input?: unknown;
    recordContent: boolean;
}): ObservationAttributes {
    return {
        model: config.modelId,
        ...(config.modelParameters ? { modelParameters: config.modelParameters } : {}),
        ...(config.metadata ? { metadata: config.metadata } : {}),
        ...(config.recordContent && config.input !== undefined
            ? {
                  input: config.input,
              }
            : {}),
    };
}

function createModelParameters(
    options: GenerateOptions | GenerateObjectOptions<SchemaInput>
): Record<string, unknown> | undefined {
    return compactRecord({
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        topP: options.topP,
    });
}

function createEmbeddingModelParameters(
    options: EmbedOptions
): Record<string, unknown> | undefined {
    return compactRecord({
        dimensions: options.dimensions,
    });
}

function createImageModelParameters(
    options: ImageGenerateOptions
): Record<string, unknown> | undefined {
    return compactRecord({
        n: options.n,
        size: options.size,
    });
}

/**
 * Langfuse prices a usage key only when the model's price definition has a key
 * with the same name, so these names follow Langfuse's managed definitions.
 * Reasoning stays inside `output`: Claude definitions don't price
 * `output_reasoning`, and every provider bills reasoning at the output rate.
 * The reasoning count goes to metadata instead, which Langfuse merges per key.
 */
function createChatUsageAttributes(usage: ChatUsage): ObservationAttributes {
    const { cacheReadTokens, cacheWriteTokens } = usage.inputTokenDetails;
    const { reasoningTokens } = usage.outputTokenDetails;

    return {
        usageDetails: {
            input: usage.inputTokens - cacheReadTokens - cacheWriteTokens,
            output: usage.outputTokens,
            input_cache_read: cacheReadTokens,
            input_cache_creation: cacheWriteTokens,
        },
        ...(reasoningTokens !== undefined
            ? { metadata: { reasoningTokens } }
            : {}),
    };
}

function createEmbeddingUsageDetails(
    usage: EmbeddingUsage | undefined
): Record<string, number> | undefined {
    if (!usage) {
        return undefined;
    }

    return {
        input: usage.inputTokens,
    };
}

function createChatOutput(result: GenerateResult): ObservationAttributes {
    return {
        parts: result.parts,
        toolCalls: result.toolCalls,
        finishReason: result.finishReason,
        ...(result.content !== null ? { content: result.content } : {}),
        ...(result.reasoning !== null ? { reasoning: result.reasoning } : {}),
    };
}

function createImageOutput(result: ImageGenerateResult): ObservationAttributes[] {
    return result.images.map((image) => ({
        hasBase64: image.base64 !== undefined,
        ...(image.url ? { url: image.url } : {}),
        ...(image.revisedPrompt ? { revisedPrompt: image.revisedPrompt } : {}),
    }));
}

function createErrorAttributes(
    error: unknown,
    recordContent: boolean
): ObservationAttributes {
    const message = getErrorMessage(error);

    return {
        level: 'ERROR',
        statusMessage: message,
        ...(recordContent
            ? {
                  output: { error: message },
              }
            : {}),
    };
}

function updateObservation(
    observation: TraceObservation,
    attributes: ObservationAttributes | undefined
): void {
    if (!attributes) {
        return;
    }

    observation.update(attributes);
}

function runGeneration<TResult>(config: {
    name: string;
    initialAttributes: ObservationAttributes;
    createSuccessAttributes: (result: TResult) => ObservationAttributes | undefined;
    recordContent: boolean;
    execute: () => Promise<TResult>;
}): Promise<TResult> {
    const { name, initialAttributes, createSuccessAttributes, recordContent, execute } =
        config;

    return startActiveObservation(
        name,
        async (observation) => {
            updateObservation(observation, initialAttributes);

            try {
                const result = await execute();
                updateObservation(observation, createSuccessAttributes(result));
                return result;
            } catch (error) {
                updateObservation(observation, createErrorAttributes(error, recordContent));
                throw error;
            }
        },
        { asType: 'generation' }
    );
}

function runEmbedding<TResult>(config: {
    name: string;
    initialAttributes: ObservationAttributes;
    createSuccessAttributes: (result: TResult) => ObservationAttributes | undefined;
    recordContent: boolean;
    execute: () => Promise<TResult>;
}): Promise<TResult> {
    const { name, initialAttributes, createSuccessAttributes, recordContent, execute } =
        config;

    return startActiveObservation(
        name,
        async (observation) => {
            updateObservation(observation, initialAttributes);

            try {
                const result = await execute();
                updateObservation(observation, createSuccessAttributes(result));
                return result;
            } catch (error) {
                updateObservation(observation, createErrorAttributes(error, recordContent));
                throw error;
            }
        },
        { asType: 'embedding' }
    );
}

function runGenerationStream<TStream, TResult>(config: {
    name: string;
    initialAttributes: ObservationAttributes;
    createSuccessAttributes: (result: TResult) => ObservationAttributes | undefined;
    recordContent: boolean;
    execute: () => Promise<TStream>;
    getResult: (stream: TStream) => Promise<TResult>;
}): Promise<TStream> {
    const {
        name,
        initialAttributes,
        createSuccessAttributes,
        recordContent,
        execute,
        getResult,
    } = config;

    return startActiveObservation(
        name,
        async (observation: LangfuseGeneration) => {
            updateObservation(observation, initialAttributes);

            try {
                const stream = await execute();

                void getResult(stream)
                    .then((result) => {
                        updateObservation(observation, createSuccessAttributes(result));
                    })
                    .catch((error: unknown) => {
                        updateObservation(observation, createErrorAttributes(error, recordContent));
                    })
                    .finally(() => {
                        observation.end();
                    });

                return stream;
            } catch (error) {
                updateObservation(observation, createErrorAttributes(error, recordContent));
                observation.end();
                throw error;
            }
        },
        { asType: 'generation', endOnExit: false }
    );
}

export function createLangfuseMiddleware(
    options: LangfuseMiddlewareOptions = {}
): ChatModelMiddleware {
    const { recordContent = false } = options;

    return {
        generate: ({ execute, options: generateOptions, model }) =>
            runGeneration<GenerateResult>({
                name: createChatObservationName(model),
                initialAttributes: createObservationAttributes({
                    modelId: model.modelId,
                    modelParameters: createModelParameters(generateOptions),
                    metadata: generateOptions.metadata,
                    input: generateOptions.messages,
                    recordContent,
                }),
                createSuccessAttributes: (result) => ({
                    ...createChatUsageAttributes(result.usage),
                    ...(recordContent
                        ? {
                              output: createChatOutput(result),
                          }
                        : {}),
                }),
                recordContent,
                execute,
            }),
        stream: ({ execute, options: generateOptions, model }) =>
            runGenerationStream<
                ReturnType<typeof execute> extends Promise<infer T> ? T : never,
                GenerateResult
            >({
                name: createChatObservationName(model),
                initialAttributes: createObservationAttributes({
                    modelId: model.modelId,
                    modelParameters: createModelParameters(generateOptions),
                    metadata: generateOptions.metadata,
                    input: generateOptions.messages,
                    recordContent,
                }),
                createSuccessAttributes: (result) => ({
                    ...createChatUsageAttributes(result.usage),
                    ...(recordContent
                        ? {
                              output: createChatOutput(result),
                          }
                        : {}),
                }),
                recordContent,
                execute,
                getResult: (chatStream) => chatStream.result,
            }),
        generateObject: <TSchema extends SchemaInput>(args: {
            execute: (
                options?: GenerateObjectOptions<TSchema>
            ) => Promise<GenerateObjectResult<TSchema>>;
            options: GenerateObjectOptions<TSchema>;
            model: ChatModel;
        }) => {
            const { execute, options: generateOptions, model } = args;

            return runGeneration<GenerateObjectResult<TSchema>>({
                name: createChatObservationName(model),
                initialAttributes: createObservationAttributes({
                    modelId: model.modelId,
                    modelParameters: createModelParameters(generateOptions),
                    metadata: generateOptions.metadata,
                    input: generateOptions.messages,
                    recordContent,
                }),
                createSuccessAttributes: (result) => ({
                    ...createChatUsageAttributes(result.usage),
                    ...(recordContent
                        ? {
                              output: result.object,
                          }
                        : {}),
                }),
                recordContent,
                execute,
            });
        },
        streamObject: <TSchema extends SchemaInput>(args: {
            execute: (
                options?: StreamObjectOptions<TSchema>
            ) => Promise<ObjectStream<TSchema>>;
            options: StreamObjectOptions<TSchema>;
            model: ChatModel;
        }) => {
            const { execute, options: generateOptions, model } = args;

            return runGenerationStream<
                ReturnType<typeof execute> extends Promise<infer T> ? T : never,
                GenerateObjectResult<TSchema>
            >({
                name: createChatObservationName(model),
                initialAttributes: createObservationAttributes({
                    modelId: model.modelId,
                    modelParameters: createModelParameters(generateOptions),
                    metadata: generateOptions.metadata,
                    input: generateOptions.messages,
                    recordContent,
                }),
                createSuccessAttributes: (result) => ({
                    ...createChatUsageAttributes(result.usage),
                    ...(recordContent
                        ? {
                              output: result.object,
                          }
                        : {}),
                }),
                recordContent,
                execute,
                getResult: (objectStream) => objectStream.result,
            });
        },
    };
}

export function createLangfuseEmbeddingMiddleware(
    options: LangfuseMiddlewareOptions = {}
): EmbeddingModelMiddleware {
    const { recordContent = false } = options;

    return {
        embed: ({ execute, options: embedOptions, model }) =>
            runEmbedding<ReturnType<typeof execute> extends Promise<infer T> ? T : never>({
                name: createEmbeddingObservationName(model),
                initialAttributes: createObservationAttributes({
                    modelId: model.modelId,
                    modelParameters: createEmbeddingModelParameters(embedOptions),
                    metadata: embedOptions.metadata,
                    input: embedOptions.input,
                    recordContent,
                }),
                createSuccessAttributes: (result) =>
                    compactRecord({
                        usageDetails: createEmbeddingUsageDetails(result.usage),
                    }),
                recordContent,
                execute,
            }),
    };
}

export function createLangfuseImageMiddleware(
    options: LangfuseMiddlewareOptions = {}
): ImageModelMiddleware {
    const { recordContent = false } = options;

    return {
        generate: ({ execute, options: imageOptions, model }) =>
            runGeneration<ReturnType<typeof execute> extends Promise<infer T> ? T : never>({
                name: createImageObservationName(model),
                initialAttributes: createObservationAttributes({
                    modelId: model.modelId,
                    modelParameters: createImageModelParameters(imageOptions),
                    metadata: imageOptions.metadata,
                    input: imageOptions.prompt,
                    recordContent,
                }),
                createSuccessAttributes: (result) =>
                    recordContent
                        ? {
                              output: createImageOutput(result),
                          }
                        : undefined,
                recordContent,
                execute,
            }),
    };
}
