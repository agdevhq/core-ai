import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
    BasicTracerProvider,
    InMemorySpanExporter,
    SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
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
    UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
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
import {
    createOtelEmbeddingMiddleware,
    createOtelImageMiddleware,
    createOtelMiddleware,
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
            tools: {
                strictSchemas: UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
            },
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

describe('@core-ai/opentelemetry', () => {
    let exporter: InMemorySpanExporter;
    let provider: BasicTracerProvider;
    let contextManager: AsyncLocalStorageContextManager;

    beforeEach(() => {
        trace.disable();
        context.disable();
        contextManager = new AsyncLocalStorageContextManager();
        contextManager.enable();
        context.setGlobalContextManager(contextManager);
        exporter = new InMemorySpanExporter();
        provider = new BasicTracerProvider({
            spanProcessors: [new SimpleSpanProcessor(exporter)],
        });
        trace.setGlobalTracerProvider(provider);
    });

    afterEach(async () => {
        await provider.shutdown();
        context.disable();
        trace.disable();
    });

    it('records generate spans with request, usage, content, and metadata attributes', async () => {
        const model = createMockChatModel();
        const wrappedModel = wrapChatModel({
            model,
            middleware: createOtelMiddleware({ recordContent: true }),
        });

        await generate({
            model: wrappedModel,
            messages: [{ role: 'user', content: 'Hi' }],
            temperature: 0.3,
            metadata: {
                functionId: 'generate-test',
                team: 'ai',
            },
        });

        const span = expectDefined(exporter.getFinishedSpans()[0]);
        expect(span.name).toBe('chat test-model');
        expect(span.kind).toBe(SpanKind.CLIENT);
        expect(span.status.code).toBe(SpanStatusCode.OK);
        expect(span.attributes['gen_ai.provider.name']).toBe('test');
        expect(span.attributes['gen_ai.request.model']).toBe('test-model');
        expect(span.attributes['gen_ai.operation.name']).toBe('chat');
        expect(span.attributes['gen_ai.output.type']).toBe('text');
        expect(span.attributes['gen_ai.request.temperature']).toBe(0.3);
        expect(span.attributes['gen_ai.response.finish_reasons']).toEqual([
            'stop',
        ]);
        expect(span.attributes['gen_ai.usage.input_tokens']).toBe(5);
        expect(span.attributes['gen_ai.usage.output_tokens']).toBe(3);
        expect(span.attributes['core_ai.function_id']).toBe('generate-test');
        expect(span.attributes['core_ai.metadata.team']).toBe('ai');
        expect(span.attributes['gen_ai.input.messages']).toBeDefined();
        expect(span.attributes['gen_ai.output.messages']).toBeDefined();
        expect(span.attributes['input.value']).toBeDefined();
        expect(span.attributes['output.value']).toBe('Hello');
    });

    it('records audio parts when content recording is enabled', async () => {
        const model = createMockChatModel();
        const wrappedModel = wrapChatModel({
            model,
            middleware: createOtelMiddleware({ recordContent: true }),
        });

        await generate({
            model: wrappedModel,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'audio',
                            source: {
                                type: 'base64',
                                mediaType: 'audio/wav',
                                data: 'base64-audio',
                            },
                        },
                    ],
                },
            ],
        });

        const span = expectDefined(exporter.getFinishedSpans()[0]);
        const inputMessages = JSON.parse(
            String(span.attributes['gen_ai.input.messages'])
        ) as Array<{
            parts: Array<{ type: string; source?: unknown }>;
        }>;

        expect(inputMessages[0]?.parts).toEqual([
            {
                type: 'audio',
                source: {
                    type: 'base64',
                    mediaType: 'audio/wav',
                    data: 'base64-audio',
                },
            },
        ]);
    });

    it('omits content attributes by default', async () => {
        const model = createMockChatModel();
        const wrappedModel = wrapChatModel({
            model,
            middleware: createOtelMiddleware(),
        });

        await generate({
            model: wrappedModel,
            messages: [{ role: 'user', content: 'Hi' }],
        });

        const span = expectDefined(exporter.getFinishedSpans()[0]);
        expect(span.attributes['gen_ai.input.messages']).toBeUndefined();
        expect(span.attributes['gen_ai.output.messages']).toBeUndefined();
        expect(span.attributes['input.value']).toBeUndefined();
        expect(span.attributes['output.value']).toBeUndefined();
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
            middleware: createOtelMiddleware({ recordContent: true }),
        });

        await generateObject({
            model: wrappedModel,
            messages: [{ role: 'user', content: 'answer with json' }],
            schema,
            schemaName: 'Answer',
        });

        const span = expectDefined(exporter.getFinishedSpans()[0]);
        expect(span.attributes['gen_ai.output.type']).toBe('json');
        expect(span.attributes['gen_ai.request.schema_name']).toBe('Answer');
        expect(span.attributes['output.value']).toBe(
            JSON.stringify({ answer: '42' })
        );
    });

    it('keeps stream spans open until the stream result resolves', async () => {
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
            middleware: createOtelMiddleware({ recordContent: true }),
        });

        const chatStream = await stream({
            model: wrappedModel,
            messages: [{ role: 'user', content: 'Hi' }],
        });

        expect(exporter.getFinishedSpans()).toHaveLength(0);

        deferred.resolve({
            ...createGenerateResult('Hello'),
            usage: {
                inputTokens: 3,
                outputTokens: 2,
                inputTokenDetails: {
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                },
                outputTokenDetails: {},
            },
        });

        await expect(chatStream.result).resolves.toMatchObject({
            content: 'Hello',
        });
        await Promise.resolve();

        const span = expectDefined(exporter.getFinishedSpans()[0]);
        expect(span.attributes['gen_ai.usage.input_tokens']).toBe(3);
        expect(span.attributes['gen_ai.usage.output_tokens']).toBe(2);
        expect(span.attributes['gen_ai.output.messages']).toBeDefined();
    });

    it('records stream errors on the span', async () => {
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
            middleware: createOtelMiddleware(),
        });

        const chatStream = await stream({
            model: wrappedModel,
            messages: [{ role: 'user', content: 'Hi' }],
        });

        deferred.reject(new Error('stream failed'));

        await expect(chatStream.result).rejects.toThrow('stream failed');
        await Promise.resolve();

        const span = expectDefined(exporter.getFinishedSpans()[0]);
        expect(span.status.code).toBe(SpanStatusCode.ERROR);
        expect(span.status.message).toBe('stream failed');
        expect(span.attributes['error.type']).toBe('Error');
    });

    it('keeps streamObject spans open until the result resolves', async () => {
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
            middleware: createOtelMiddleware({ recordContent: true }),
        });

        const objStream = await streamObject({
            model: wrappedModel,
            messages: [{ role: 'user', content: 'weather in Berlin' }],
            schema,
        });

        expect(exporter.getFinishedSpans()).toHaveLength(0);

        deferred.resolve({
            object: { city: 'Berlin', temperatureC: 21 },
            finishReason: 'stop',
            usage: createChatUsage(),
        });

        await expect(objStream.result).resolves.toMatchObject({
            object: { city: 'Berlin', temperatureC: 21 },
        });
        await Promise.resolve();

        const span = expectDefined(exporter.getFinishedSpans()[0]);
        expect(span.status.code).toBe(SpanStatusCode.OK);
        expect(span.attributes['gen_ai.output.type']).toBe('json');
        expect(span.attributes['gen_ai.usage.input_tokens']).toBe(5);
        expect(span.attributes['gen_ai.usage.output_tokens']).toBe(3);
        expect(span.attributes['output.value']).toBe(
            JSON.stringify({ city: 'Berlin', temperatureC: 21 })
        );
    });

    it('records streamObject errors on the span', async () => {
        const schema = z.object({
            city: z.string(),
            temperatureC: z.number(),
        });
        const deferred = createDeferred<GenerateObjectResult<typeof schema>>();
        const expected: ObjectStream<typeof schema> = {
            async *[Symbol.asyncIterator]() {
                yield {
                    type: 'finish',
                    finishReason: 'stop',
                    usage: createChatUsage(),
                };
            },
            result: deferred.promise,
            events: Promise.resolve([]),
        };
        const model = createMockChatModel({
            streamObject: vi.fn(
                async () => expected
            ) as ChatModel['streamObject'],
        });
        const wrappedModel = wrapChatModel({
            model,
            middleware: createOtelMiddleware(),
        });

        const objStream = await streamObject({
            model: wrappedModel,
            messages: [{ role: 'user', content: 'weather' }],
            schema,
        });

        deferred.reject(new Error('object stream failed'));

        await expect(objStream.result).rejects.toThrow('object stream failed');
        await Promise.resolve();

        const span = expectDefined(exporter.getFinishedSpans()[0]);
        expect(span.status.code).toBe(SpanStatusCode.ERROR);
        expect(span.status.message).toBe('object stream failed');
        expect(span.attributes['error.type']).toBe('Error');
    });

    it('parents child spans created during generate execution', async () => {
        const model = createMockChatModel({
            generate: vi.fn(async () => {
                const child = trace.getTracer('test').startSpan('child');
                child.end();

                return createGenerateResult('Hello');
            }),
        });
        const wrappedModel = wrapChatModel({
            model,
            middleware: createOtelMiddleware(),
        });

        await generate({
            model: wrappedModel,
            messages: [{ role: 'user', content: 'Hi' }],
        });

        const spans = exporter.getFinishedSpans();
        const parentSpan = spans.find(
            (span) => span.name === 'chat test-model'
        );
        const childSpan = spans.find((span) => span.name === 'child');

        expect(parentSpan).toBeDefined();
        expect(childSpan).toBeDefined();
        expect(childSpan?.spanContext().traceId).toBe(
            parentSpan?.spanContext().traceId
        );
        expect(childSpan?.parentSpanContext?.spanId).toBe(
            parentSpan?.spanContext().spanId
        );
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
            middleware: createOtelEmbeddingMiddleware({ recordContent: true }),
        });

        await embed({
            model: wrappedModel,
            input: ['hello', 'world'],
        });

        const span = expectDefined(exporter.getFinishedSpans()[0]);
        expect(span.name).toBe('embeddings embed-model');
        expect(span.attributes['gen_ai.usage.input_tokens']).toBe(3);
        expect(span.attributes['input.value']).toBe(
            JSON.stringify(['hello', 'world'])
        );
    });

    it('records image prompts', async () => {
        const model: ImageModel = {
            provider: 'test',
            modelId: 'image-model',
            generate: vi.fn(async () => ({
                images: [{ base64: 'abc' }],
            })),
        };
        const wrappedModel = wrapImageModel({
            model,
            middleware: createOtelImageMiddleware({ recordContent: true }),
        });

        await generateImage({
            model: wrappedModel,
            prompt: 'a cat',
        });

        const span = expectDefined(exporter.getFinishedSpans()[0]);
        expect(span.name).toBe('image_generation image-model');
        expect(span.attributes['gen_ai.output.type']).toBe('image');
        expect(span.attributes['input.value']).toBe('a cat');
    });
});
