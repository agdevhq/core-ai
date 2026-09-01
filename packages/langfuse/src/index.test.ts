import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
    defineTool,
    embed,
    generate,
    generateImage,
    generateObject,
    stream,
    streamObject,
    wrapChatModel,
    wrapEmbeddingModel,
    wrapImageModel,
    MULTIMODAL_INPUT_MODALITIES,
    zodSchemaToJsonSchema,
} from '@core-ai/core-ai';
import type {
    ChatModel,
    ChatOutputTokenDetails,
    ChatStream,
    EmbeddingModel,
    GenerateObjectResult,
    GenerateResult,
    ImageModel,
    ObjectStream,
    ObjectStreamEvent,
} from '@core-ai/core-ai';

type MockObservation = {
    update: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
};

type StartActiveObservationOptions = {
    asType?: string;
    endOnExit?: boolean;
};

type StartActiveObservationImplementation = (
    name: string,
    fn: (observation: MockObservation) => Promise<unknown> | unknown,
    options?: StartActiveObservationOptions
) => Promise<unknown> | unknown;

const { startActiveObservationMock } = vi.hoisted(() => ({
    startActiveObservationMock: vi.fn<StartActiveObservationImplementation>(),
}));

vi.mock('@langfuse/tracing', () => ({
    startActiveObservation: startActiveObservationMock,
}));

import {
    createLangfuseEmbeddingMiddleware,
    createLangfuseImageMiddleware,
    createLangfuseMiddleware,
} from './index.ts';

async function* finishEvents(): AsyncIterable<{
    type: 'finish';
    finishReason: 'stop';
    usage: {
        inputTokens: number;
        outputTokens: number;
        inputTokenDetails: {
            cacheReadTokens: number;
            cacheWriteTokens: number;
        };
        outputTokenDetails: ChatOutputTokenDetails;
    };
}> {
    yield {
        type: 'finish',
        finishReason: 'stop',
        usage: {
            inputTokens: 1,
            outputTokens: 1,
            inputTokenDetails: {
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
            },
            outputTokenDetails: {},
        },
    };
}

function createChatUsage(): GenerateResult['usage'] {
    return {
        inputTokens: 5,
        outputTokens: 3,
        inputTokenDetails: {
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
        },
        outputTokenDetails: {},
    };
}

function createGenerateResult(content: string): GenerateResult {
    return {
        parts: [{ type: 'text', text: content }],
        content,
        reasoning: null,
        toolCalls: [],
        finishReason: 'stop',
        usage: createChatUsage(),
    };
}

function createDeferred<T>(): {
    promise: Promise<T>;
    resolve(value: T): void;
    reject(error: unknown): void;
} {
    let resolve: ((value: T) => void) | undefined;
    let reject: ((error: unknown) => void) | undefined;

    return {
        promise: new Promise<T>((resolvePromise, rejectPromise) => {
            resolve = resolvePromise;
            reject = rejectPromise;
        }),
        resolve(value: T) {
            resolve?.(value);
        },
        reject(error: unknown) {
            reject?.(error);
        },
    };
}

function expectDefined<T>(value: T | undefined): T {
    expect(value).toBeDefined();

    if (value === undefined) {
        throw new Error('expected value to be defined');
    }

    return value;
}

function createMockChatModel(
    overrides?: Partial<{
        generate: ChatModel['generate'];
        stream: ChatModel['stream'];
        generateObject: ChatModel['generateObject'];
        streamObject: ChatModel['streamObject'];
    }>
): ChatModel {
    return {
        provider: 'test',
        modelId: 'test-model',
        capabilities: {
            reasoning: {
                mode: 'unsupported',
                supportedEfforts: [],
                restrictsSamplingParams: false,
                supportedToolChoices: ['auto', 'none', 'required', 'tool'],
            },
            modalities: MULTIMODAL_INPUT_MODALITIES,
        },
        generate:
            overrides?.generate ??
            vi.fn(async () => createGenerateResult('Hello')),
        stream:
            overrides?.stream ??
            vi.fn(async () => {
                throw new Error('not implemented');
            }),
        generateObject:
            overrides?.generateObject ??
            (vi.fn(async () => {
                throw new Error('not implemented');
            }) as ChatModel['generateObject']),
        streamObject:
            overrides?.streamObject ??
            (vi.fn(async () => {
                throw new Error('not implemented');
            }) as ChatModel['streamObject']),
    };
}

describe('@core-ai/langfuse', () => {
    let observations: MockObservation[];

    beforeEach(() => {
        observations = [];

        startActiveObservationMock.mockImplementation(
            async (_name, fn, options) => {
                const observation: MockObservation = {
                    update: vi.fn(),
                    end: vi.fn(),
                };
                observations.push(observation);

                try {
                    const result = await fn(observation);

                    if (options?.endOnExit !== false) {
                        observation.end();
                    }

                    return result;
                } catch (error) {
                    if (options?.endOnExit !== false) {
                        observation.end();
                    }

                    throw error;
                }
            }
        );
    });

    afterEach(() => {
        startActiveObservationMock.mockReset();
    });

    it('records generate observations with model parameters, metadata, usage, and output', async () => {
        const model = createMockChatModel();
        const wrappedModel = wrapChatModel({
            model,
            middleware: createLangfuseMiddleware({ recordContent: true }),
        });

        await generate({
            model: wrappedModel,
            messages: [{ role: 'user', content: 'Hi' }],
            temperature: 0.3,
            maxTokens: 100,
            topP: 0.9,
            metadata: {
                functionId: 'generate-test',
                team: 'ai',
            },
        });

        const observation = expectDefined(observations[0]);

        expect(startActiveObservationMock).toHaveBeenCalledWith(
            'chat test-model',
            expect.any(Function),
            { asType: 'generation' }
        );
        expect(observation.update).toHaveBeenNthCalledWith(1, {
            model: 'test-model',
            modelParameters: {
                temperature: 0.3,
                maxTokens: 100,
                topP: 0.9,
            },
            metadata: {
                functionId: 'generate-test',
                team: 'ai',
            },
            input: [{ role: 'user', content: 'Hi' }],
        });
        expect(observation.update).toHaveBeenNthCalledWith(2, {
            usageDetails: {
                input: 5,
                output: 3,
                cache_read_input: 0,
                cache_creation_input: 0,
            },
            output: {
                content: 'Hello',
                parts: [{ type: 'text', text: 'Hello' }],
                toolCalls: [],
                finishReason: 'stop',
            },
        });
        expect(observation.end).toHaveBeenCalledTimes(1);
    });

    it('omits input and output content by default', async () => {
        const model = createMockChatModel();
        const wrappedModel = wrapChatModel({
            model,
            middleware: createLangfuseMiddleware(),
        });

        await generate({
            model: wrappedModel,
            messages: [{ role: 'user', content: 'Hi' }],
        });

        const observation = expectDefined(observations[0]);

        expect(observation.update).toHaveBeenNthCalledWith(1, {
            model: 'test-model',
        });
        expect(observation.update).toHaveBeenNthCalledWith(2, {
            usageDetails: {
                input: 5,
                output: 3,
                cache_read_input: 0,
                cache_creation_input: 0,
            },
        });
    });

    it('records available tools and toolChoice when recordContent is enabled', async () => {
        const weatherTool = defineTool({
            name: 'get_weather',
            description: 'Get the weather in a location',
            parameters: z.object({
                location: z.string(),
            }),
        });
        const model = createMockChatModel();
        const wrappedModel = wrapChatModel({
            model,
            middleware: createLangfuseMiddleware({ recordContent: true }),
        });

        await generate({
            model: wrappedModel,
            messages: [{ role: 'user', content: 'Weather in Berlin?' }],
            tools: {
                get_weather: weatherTool,
            },
            toolChoice: 'auto',
            metadata: {
                feature: 'weather',
            },
        });

        const observation = expectDefined(observations[0]);

        expect(observation.update).toHaveBeenNthCalledWith(1, {
            model: 'test-model',
            modelParameters: {
                toolChoice: 'auto',
            },
            metadata: {
                feature: 'weather',
                tools: [
                    {
                        type: 'function',
                        name: 'get_weather',
                        description: 'Get the weather in a location',
                        parameters: zodSchemaToJsonSchema(
                            weatherTool.parameters
                        ),
                    },
                ],
            },
            input: [{ role: 'user', content: 'Weather in Berlin?' }],
        });
    });

    it('records forced toolChoice as JSON and omits tools when recordContent is disabled', async () => {
        const weatherTool = defineTool({
            name: 'get_weather',
            description: 'Get the weather in a location',
            parameters: z.object({
                location: z.string(),
            }),
        });
        const model = createMockChatModel();
        const wrappedModel = wrapChatModel({
            model,
            middleware: createLangfuseMiddleware(),
        });

        await generate({
            model: wrappedModel,
            messages: [{ role: 'user', content: 'Weather in Berlin?' }],
            tools: {
                get_weather: weatherTool,
            },
            toolChoice: { type: 'tool', toolName: 'get_weather' },
            metadata: {
                feature: 'weather',
            },
        });

        const observation = expectDefined(observations[0]);

        expect(observation.update).toHaveBeenNthCalledWith(1, {
            model: 'test-model',
            modelParameters: {
                toolChoice: JSON.stringify({
                    type: 'tool',
                    toolName: 'get_weather',
                }),
            },
            metadata: {
                feature: 'weather',
            },
        });
    });

    it('records object output for generateObject', async () => {
        const schema = z.object({
            answer: z.string(),
        });
        const model = createMockChatModel({
            generateObject: vi.fn(async () => ({
                object: { answer: '42' },
                finishReason: 'stop',
                usage: createChatUsage(),
            })) as ChatModel['generateObject'],
        });
        const wrappedModel = wrapChatModel({
            model,
            middleware: createLangfuseMiddleware({ recordContent: true }),
        });

        await generateObject({
            model: wrappedModel,
            messages: [{ role: 'user', content: 'answer with json' }],
            schema,
            schemaName: 'Answer',
        });

        const observation = expectDefined(observations[0]);

        expect(observation.update).toHaveBeenNthCalledWith(1, {
            model: 'test-model',
            metadata: undefined,
            input: [{ role: 'user', content: 'answer with json' }],
        });
        expect(observation.update).toHaveBeenNthCalledWith(2, {
            usageDetails: {
                input: 5,
                output: 3,
                cache_read_input: 0,
                cache_creation_input: 0,
            },
            output: { answer: '42' },
        });
    });

    it('keeps stream observations open until the stream result resolves', async () => {
        const deferred = createDeferred<GenerateResult>();
        const expected: ChatStream = {
            [Symbol.asyncIterator]() {
                return finishEvents()[Symbol.asyncIterator]();
            },
            result: deferred.promise,
            events: Promise.resolve([]),
        };
        const model = createMockChatModel({
            stream: vi.fn(async () => expected),
        });
        const wrappedModel = wrapChatModel({
            model,
            middleware: createLangfuseMiddleware({ recordContent: true }),
        });

        const chatStream = await stream({
            model: wrappedModel,
            messages: [{ role: 'user', content: 'Hi' }],
        });

        const observation = expectDefined(observations[0]);

        expect(startActiveObservationMock).toHaveBeenCalledWith(
            'chat test-model',
            expect.any(Function),
            { asType: 'generation', endOnExit: false }
        );
        expect(observation.end).not.toHaveBeenCalled();

        deferred.resolve(createGenerateResult('Hello'));

        await expect(chatStream.result).resolves.toMatchObject({
            content: 'Hello',
        });
        await Promise.resolve();

        expect(observation.update).toHaveBeenNthCalledWith(2, {
            usageDetails: {
                input: 5,
                output: 3,
                cache_read_input: 0,
                cache_creation_input: 0,
            },
            output: {
                content: 'Hello',
                parts: [{ type: 'text', text: 'Hello' }],
                toolCalls: [],
                finishReason: 'stop',
            },
        });
        expect(observation.end).toHaveBeenCalledTimes(1);
    });

    it('records stream errors and ends the observation', async () => {
        const deferred = createDeferred<GenerateResult>();
        const expected: ChatStream = {
            [Symbol.asyncIterator]() {
                return finishEvents()[Symbol.asyncIterator]();
            },
            result: deferred.promise,
            events: Promise.resolve([]),
        };
        const model = createMockChatModel({
            stream: vi.fn(async () => expected),
        });
        const wrappedModel = wrapChatModel({
            model,
            middleware: createLangfuseMiddleware(),
        });

        const chatStream = await stream({
            model: wrappedModel,
            messages: [{ role: 'user', content: 'Hi' }],
        });

        const observation = expectDefined(observations[0]);

        deferred.reject(new Error('stream failed'));

        await expect(chatStream.result).rejects.toThrow('stream failed');
        await Promise.resolve();

        expect(observation.update).toHaveBeenNthCalledWith(2, {
            level: 'ERROR',
            statusMessage: 'stream failed',
        });
        expect(observation.end).toHaveBeenCalledTimes(1);
    });

    it('records generate errors before rethrowing', async () => {
        const model = createMockChatModel({
            generate: vi.fn(async () => {
                throw new Error('generate failed');
            }),
        });
        const wrappedModel = wrapChatModel({
            model,
            middleware: createLangfuseMiddleware(),
        });

        await expect(
            generate({
                model: wrappedModel,
                messages: [{ role: 'user', content: 'Hi' }],
            })
        ).rejects.toThrow('generate failed');

        const observation = expectDefined(observations[0]);

        expect(observation.update).toHaveBeenNthCalledWith(2, {
            level: 'ERROR',
            statusMessage: 'generate failed',
        });
        expect(observation.end).toHaveBeenCalledTimes(1);
    });

    it('keeps streamObject observations open until the result resolves', async () => {
        const schema = z.object({
            city: z.string(),
            temperatureC: z.number(),
        });
        const deferred = createDeferred<GenerateObjectResult<typeof schema>>();
        const objectEvents: ObjectStreamEvent<typeof schema>[] = [
            { type: 'object', object: { city: 'Berlin', temperatureC: 21 } },
            { type: 'finish', finishReason: 'stop', usage: createChatUsage() },
        ];
        const expected: ObjectStream<typeof schema> = {
            async *[Symbol.asyncIterator]() {
                yield* objectEvents;
            },
            result: deferred.promise,
            events: Promise.resolve(objectEvents),
        };
        const model = createMockChatModel({
            streamObject: vi.fn(
                async () => expected
            ) as ChatModel['streamObject'],
        });
        const wrappedModel = wrapChatModel({
            model,
            middleware: createLangfuseMiddleware({ recordContent: true }),
        });

        const objectStream = await streamObject({
            model: wrappedModel,
            messages: [{ role: 'user', content: 'weather in Berlin' }],
            schema,
        });

        const observation = expectDefined(observations[0]);

        expect(observation.end).not.toHaveBeenCalled();

        deferred.resolve({
            object: { city: 'Berlin', temperatureC: 21 },
            finishReason: 'stop',
            usage: createChatUsage(),
        });

        await expect(objectStream.result).resolves.toMatchObject({
            object: { city: 'Berlin', temperatureC: 21 },
        });
        await Promise.resolve();

        expect(observation.update).toHaveBeenNthCalledWith(2, {
            usageDetails: {
                input: 5,
                output: 3,
                cache_read_input: 0,
                cache_creation_input: 0,
            },
            output: { city: 'Berlin', temperatureC: 21 },
        });
        expect(observation.end).toHaveBeenCalledTimes(1);
    });

    it('records embedding input and usage', async () => {
        const model: EmbeddingModel = {
            provider: 'test',
            modelId: 'embed-model',
            embed: vi.fn(async () => ({
                embeddings: [[0.1, 0.2]],
                usage: {
                    inputTokens: 3,
                },
            })),
        };
        const wrappedModel = wrapEmbeddingModel({
            model,
            middleware: createLangfuseEmbeddingMiddleware({
                recordContent: true,
            }),
        });

        await embed({
            model: wrappedModel,
            input: ['hello', 'world'],
            dimensions: 512,
        });

        const observation = expectDefined(observations[0]);

        expect(startActiveObservationMock).toHaveBeenCalledWith(
            'embeddings embed-model',
            expect.any(Function),
            { asType: 'embedding' }
        );
        expect(observation.update).toHaveBeenNthCalledWith(1, {
            model: 'embed-model',
            modelParameters: {
                dimensions: 512,
            },
            input: ['hello', 'world'],
        });
        expect(observation.update).toHaveBeenNthCalledWith(2, {
            usageDetails: {
                input: 3,
            },
        });
    });

    it('records image prompts and sanitized outputs', async () => {
        const model: ImageModel = {
            provider: 'test',
            modelId: 'image-model',
            generate: vi.fn(async () => ({
                images: [
                    {
                        base64: 'abc',
                    },
                    {
                        url: 'https://example.com/cat.png',
                        revisedPrompt: 'a fluffy cat',
                    },
                ],
            })),
        };
        const wrappedModel = wrapImageModel({
            model,
            middleware: createLangfuseImageMiddleware({ recordContent: true }),
        });

        await generateImage({
            model: wrappedModel,
            prompt: 'a cat',
            n: 2,
            size: '1024x1024',
        });

        const observation = expectDefined(observations[0]);

        expect(startActiveObservationMock).toHaveBeenCalledWith(
            'image_generation image-model',
            expect.any(Function),
            { asType: 'generation' }
        );
        expect(observation.update).toHaveBeenNthCalledWith(1, {
            model: 'image-model',
            modelParameters: {
                n: 2,
                size: '1024x1024',
            },
            input: 'a cat',
        });
        expect(observation.update).toHaveBeenNthCalledWith(2, {
            output: [
                {
                    hasBase64: true,
                },
                {
                    hasBase64: false,
                    url: 'https://example.com/cat.png',
                    revisedPrompt: 'a fluffy cat',
                },
            ],
        });
    });
});
