import { startActiveObservation } from '@langfuse/tracing';
import type { LangfuseEmbedding, LangfuseGeneration } from '@langfuse/tracing';
import type { z } from 'zod';
import {
    zodSchemaToJsonSchema,
    type ChatModel,
    type ChatModelMiddleware,
    type ChatUsage,
    type EmbedOptions,
    type EmbeddingModel,
    type EmbeddingModelMiddleware,
    type EmbeddingUsage,
    type GenerateObjectOptions,
    type GenerateObjectResult,
    type GenerateOptions,
    type GenerateResult,
    type ImageGenerateOptions,
    type ImageGenerateResult,
    type ImageModel,
    type ImageModelMiddleware,
    type ObjectStream,
    type StreamObjectOptions,
    type ToolChoice,
    type ToolSet,
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

function serializeToolChoice(toolChoice: ToolChoice): string {
    return typeof toolChoice === 'string'
        ? toolChoice
        : JSON.stringify(toolChoice);
}

function createToolDefinitions(
    tools?: ToolSet
): Array<{
    type: 'function';
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}> | undefined {
    if (!tools || Object.keys(tools).length === 0) {
        return undefined;
    }

    return Object.entries(tools).map(([name, definition]) => ({
        type: 'function',
        name,
        description: definition.description,
        parameters: zodSchemaToJsonSchema(definition.parameters),
    }));
}

function createChatMetadata(config: {
    metadata?: Record<string, unknown>;
    tools?: ToolSet;
    recordContent: boolean;
}): Record<string, unknown> | undefined {
    const toolDefinitions = config.recordContent
        ? createToolDefinitions(config.tools)
        : undefined;

    if (!config.metadata && !toolDefinitions) {
        return undefined;
    }

    return {
        ...config.metadata,
        ...(toolDefinitions ? { tools: toolDefinitions } : {}),
    };
}

function createModelParameters(
    options: GenerateOptions | GenerateObjectOptions<z.ZodType>
): Record<string, unknown> | undefined {
    const toolChoice =
        'toolChoice' in options && options.toolChoice !== undefined
            ? serializeToolChoice(options.toolChoice)
            : undefined;

    return compactRecord({
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        topP: options.topP,
        toolChoice,
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

function createChatUsageDetails(usage: ChatUsage): Record<string, number> {
    const { cacheReadTokens, cacheWriteTokens } = usage.inputTokenDetails;
    const reasoningTokens = usage.outputTokenDetails.reasoningTokens ?? 0;

    return {
        input: usage.inputTokens - cacheReadTokens - cacheWriteTokens,
        output: usage.outputTokens - reasoningTokens,
        cache_read_input: cacheReadTokens,
        cache_creation_input: cacheWriteTokens,
        ...(usage.outputTokenDetails.reasoningTokens !== undefined
            ? { reasoning_output: usage.outputTokenDetails.reasoningTokens }
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
                    metadata: createChatMetadata({
                        metadata: generateOptions.metadata,
                        tools: generateOptions.tools,
                        recordContent,
                    }),
                    input: generateOptions.messages,
                    recordContent,
                }),
                createSuccessAttributes: (result) => ({
                    usageDetails: createChatUsageDetails(result.usage),
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
                    metadata: createChatMetadata({
                        metadata: generateOptions.metadata,
                        tools: generateOptions.tools,
                        recordContent,
                    }),
                    input: generateOptions.messages,
                    recordContent,
                }),
                createSuccessAttributes: (result) => ({
                    usageDetails: createChatUsageDetails(result.usage),
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
        generateObject: <TSchema extends z.ZodType>(args: {
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
                    metadata: createChatMetadata({
                        metadata: generateOptions.metadata,
                        recordContent,
                    }),
                    input: generateOptions.messages,
                    recordContent,
                }),
                createSuccessAttributes: (result) => ({
                    usageDetails: createChatUsageDetails(result.usage),
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
        streamObject: <TSchema extends z.ZodType>(args: {
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
                    metadata: createChatMetadata({
                        metadata: generateOptions.metadata,
                        recordContent,
                    }),
                    input: generateOptions.messages,
                    recordContent,
                }),
                createSuccessAttributes: (result) => ({
                    usageDetails: createChatUsageDetails(result.usage),
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
