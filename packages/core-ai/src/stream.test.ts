import { describe, expect, it, vi } from 'vitest';
import {
    toAsyncIterable,
    createPushableAsyncIterable,
} from '@core-ai/testing';
import { StreamAbortedError } from './errors.ts';
import { createStream } from './base-stream.ts';
import { createChatStream } from './stream.ts';
import type { StreamEvent } from './types.ts';

describe('createChatStream', () => {
    it('should iterate over all events', async () => {
        const events: StreamEvent[] = [
            { type: 'text-delta', text: 'Hello' },
            { type: 'text-delta', text: ' world' },
            {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                    inputTokens: 10,
                    outputTokens: 5,
                    inputTokenDetails: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                    },
                    outputTokenDetails: {},
                },
            },
        ];
        const chatStream = createChatStream(toAsyncIterable(events));
        const collected: StreamEvent[] = [];

        for await (const event of chatStream) {
            collected.push(event);
        }

        expect(collected).toEqual(events);
    });

    it('should aggregate content via result', async () => {
        const events: StreamEvent[] = [
            { type: 'reasoning-start' },
            { type: 'reasoning-delta', text: 'Thinking...' },
            { type: 'reasoning-end' },
            { type: 'text-delta', text: 'Hello' },
            { type: 'text-delta', text: ' world' },
            {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                    inputTokens: 10,
                    outputTokens: 5,
                    inputTokenDetails: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                    },
                    outputTokenDetails: {},
                },
            },
        ];
        const chatStream = createChatStream(toAsyncIterable(events));
        const response = await chatStream.result;

        expect(response.content).toBe('Hello world');
        expect(response.reasoning).toBe('Thinking...');
        expect(response.parts).toEqual([
            {
                type: 'reasoning',
                text: 'Thinking...',
            },
            {
                type: 'text',
                text: 'Hello world',
            },
        ]);
        expect(response.finishReason).toBe('stop');
        expect(response.toolCalls).toEqual([]);
        expect(response.usage).toEqual({
            inputTokens: 10,
            outputTokens: 5,
            inputTokenDetails: {
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
            },
            outputTokenDetails: {},
        });
    });

    it('should aggregate tool calls from stream events', async () => {
        const events: StreamEvent[] = [
            {
                type: 'tool-call-start',
                toolCallId: 'tc1',
                toolName: 'search',
            },
            {
                type: 'tool-call-delta',
                toolCallId: 'tc1',
                argumentsDelta: '{"query":"hello"}',
            },
            {
                type: 'tool-call-end',
                toolCall: {
                    id: 'tc1',
                    name: 'search',
                    arguments: { query: 'hello' },
                },
            },
            {
                type: 'finish',
                finishReason: 'tool-calls',
                usage: {
                    inputTokens: 10,
                    outputTokens: 20,
                    inputTokenDetails: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                    },
                    outputTokenDetails: {},
                },
            },
        ];
        const chatStream = createChatStream(toAsyncIterable(events));
        const response = await chatStream.result;

        expect(response.parts).toEqual([
            {
                type: 'tool-call',
                toolCall: {
                    id: 'tc1',
                    name: 'search',
                    arguments: { query: 'hello' },
                },
            },
        ]);
        expect(response.toolCalls).toEqual([
            {
                id: 'tc1',
                name: 'search',
                arguments: { query: 'hello' },
            },
        ]);
        expect(response.finishReason).toBe('tool-calls');
    });

    it('should preserve reasoning providerMetadata from stream events', async () => {
        const events: StreamEvent[] = [
            { type: 'reasoning-start' },
            { type: 'reasoning-delta', text: 'thinking' },
            {
                type: 'reasoning-end',
                providerMetadata: { openai: { encryptedContent: 'enc_abc' } },
            },
            {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                    inputTokens: 2,
                    outputTokens: 3,
                    inputTokenDetails: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                    },
                    outputTokenDetails: {},
                },
            },
        ];
        const chatStream = createChatStream(toAsyncIterable(events));
        const response = await chatStream.result;

        expect(response.parts).toEqual([
            {
                type: 'reasoning',
                text: 'thinking',
                providerMetadata: { openai: { encryptedContent: 'enc_abc' } },
            },
        ]);
    });

    it('should resolve result without iteration', async () => {
        const events: StreamEvent[] = [
            { type: 'text-delta', text: 'auto' },
            {
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
            },
        ];
        const chatStream = createChatStream(toAsyncIterable(events));
        const response = await chatStream.result;

        expect(response.content).toBe('auto');
        expect(response.reasoning).toBeNull();
    });

    it('should replay all events after completion', async () => {
        const events: StreamEvent[] = [
            { type: 'text-delta', text: 'Hello' },
            {
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
            },
        ];
        const chatStream = createChatStream(toAsyncIterable(events));
        const firstPass: StreamEvent[] = [];
        const secondPass: StreamEvent[] = [];

        for await (const event of chatStream) {
            firstPass.push(event);
        }
        for await (const event of chatStream) {
            secondPass.push(event);
        }

        expect(firstPass).toEqual(events);
        expect(secondPass).toEqual(events);
    });

    it('should replay buffered events for late iterators and continue live', async () => {
        const source = createPushableAsyncIterable<StreamEvent>();
        const chatStream = createChatStream(source.iterable);
        const finishEvent: StreamEvent = {
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

        source.push({ type: 'text-delta', text: 'Hello' });
        await Promise.resolve();

        const iterator = chatStream[Symbol.asyncIterator]();

        expect(await iterator.next()).toEqual({
            done: false,
            value: { type: 'text-delta', text: 'Hello' },
        });

        source.push({ type: 'text-delta', text: ' world' });
        source.push(finishEvent);
        source.finish();

        expect(await iterator.next()).toEqual({
            done: false,
            value: { type: 'text-delta', text: ' world' },
        });
        expect(await iterator.next()).toEqual({
            done: false,
            value: finishEvent,
        });
        expect(await iterator.next()).toEqual({
            done: true,
            value: undefined,
        });
        await expect(chatStream.result).resolves.toMatchObject({
            content: 'Hello world',
        });
    });

    it('should close only the returning iterator and wake pending next calls', async () => {
        const source = createPushableAsyncIterable<StreamEvent>();
        const chatStream = createChatStream(source.iterable);
        const iterator = chatStream[Symbol.asyncIterator]();
        const pendingNext = iterator.next();
        const finishEvent: StreamEvent = {
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

        await Promise.resolve();

        const closeIterator = iterator.return?.bind(iterator);

        expect(closeIterator).toBeDefined();
        expect(await closeIterator!()).toEqual({
            done: true,
            value: undefined,
        });
        expect(await pendingNext).toEqual({
            done: true,
            value: undefined,
        });

        source.push({ type: 'text-delta', text: 'Hello' });
        source.push(finishEvent);
        source.finish();

        expect(await iterator.next()).toEqual({
            done: true,
            value: undefined,
        });
        await expect(chatStream.result).resolves.toMatchObject({
            content: 'Hello',
            finishReason: 'stop',
        });
    });

    it('should resolve events with full history on success', async () => {
        const events: StreamEvent[] = [
            { type: 'text-delta', text: 'history' },
            {
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
            },
        ];
        const chatStream = createChatStream(toAsyncIterable(events));

        await expect(chatStream.events).resolves.toEqual(events);
    });

    it('should resolve events and reject result on upstream failure', async () => {
        const source = createPushableAsyncIterable<StreamEvent>();
        const chatStream = createChatStream(source.iterable);
        const failure = new Error('stream failed');

        source.push({ type: 'text-delta', text: 'partial' });
        source.fail(failure);

        await expect(chatStream.result).rejects.toBe(failure);
        await expect(chatStream.events).resolves.toEqual([
            { type: 'text-delta', text: 'partial' },
        ]);
    });

    it('should reject active iterators on upstream failure', async () => {
        const source = createPushableAsyncIterable<StreamEvent>();
        const chatStream = createChatStream(source.iterable);
        const iterator = chatStream[Symbol.asyncIterator]();
        const failure = new Error('boom');

        source.push({ type: 'text-delta', text: 'partial' });

        expect(await iterator.next()).toEqual({
            done: false,
            value: { type: 'text-delta', text: 'partial' },
        });

        source.fail(failure);

        await expect(chatStream.result).rejects.toBe(failure);
        await expect(iterator.next()).rejects.toBe(failure);
    });

    it('should close the upstream iterator when reduceEvent throws', async () => {
        const controller = new AbortController();
        const removeEventListenerSpy = vi.spyOn(
            controller.signal,
            'removeEventListener'
        );
        const returnSpy = vi.fn(async () => ({
            done: true as const,
            value: undefined,
        }));
        const stream = createStream<string, string>({
            source: {
                [Symbol.asyncIterator]() {
                    return {
                        async next() {
                            return {
                                done: false as const,
                                value: 'event',
                            };
                        },
                        return: returnSpy,
                    };
                },
            },
            reduceEvent() {
                throw new Error('reduce failed');
            },
            finalizeResult() {
                return 'done';
            },
            signal: controller.signal,
        });

        await expect(stream.result).rejects.toThrow('reduce failed');
        expect(returnSpy).toHaveBeenCalledTimes(1);
        expect(removeEventListenerSpy).toHaveBeenCalledTimes(1);
    });

    it('should close the upstream iterator at most once when abort races with next resolution', async () => {
        const controller = new AbortController();
        let resolveNext: ((value: IteratorResult<string>) => void) | undefined;
        const returnSpy = vi.fn(async () => ({
            done: true as const,
            value: undefined,
        }));
        const stream = createStream<string, string>({
            source: {
                [Symbol.asyncIterator]() {
                    return {
                        next() {
                            return new Promise<IteratorResult<string>>((resolve) => {
                                resolveNext = resolve;
                            });
                        },
                        return: returnSpy,
                    };
                },
            },
            reduceEvent() {},
            finalizeResult() {
                return 'done';
            },
            signal: controller.signal,
        });

        await Promise.resolve();

        if (!resolveNext) {
            throw new Error('expected next() to be pending');
        }

        controller.abort();
        resolveNext({
            done: true,
            value: undefined,
        });

        await expect(stream.result).rejects.toBeInstanceOf(StreamAbortedError);
        expect(returnSpy).toHaveBeenCalledTimes(1);
    });

    it('should not emit unhandledRejection when callers only iterate a failing stream', async () => {
        const source = createPushableAsyncIterable<StreamEvent>();
        const chatStream = createChatStream(source.iterable);
        const unhandledRejections: unknown[] = [];
        const handleUnhandledRejection = (reason: unknown) => {
            unhandledRejections.push(reason);
        };
        process.on('unhandledRejection', handleUnhandledRejection);

        try {
            source.push({ type: 'text-delta', text: 'partial' });
            source.fail(new Error('boom'));

            await expect(
                (async () => {
                    for await (const _event of chatStream) {
                        // Consume stream without touching .result.
                    }
                })()
            ).rejects.toThrow('boom');

            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(unhandledRejections).toEqual([]);
        } finally {
            process.off('unhandledRejection', handleUnhandledRejection);
        }
    });

    it('should remove the abort listener after successful completion', async () => {
        const controller = new AbortController();
        const removeEventListenerSpy = vi.spyOn(
            controller.signal,
            'removeEventListener'
        );
        const events: StreamEvent[] = [
            { type: 'text-delta', text: 'done' },
            {
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
            },
        ];
        const chatStream = createChatStream(toAsyncIterable(events), {
            signal: controller.signal,
        });

        await expect(chatStream.result).resolves.toMatchObject({
            content: 'done',
        });
        expect(removeEventListenerSpy).toHaveBeenCalledTimes(1);
    });

    it('should reject result and iterators with StreamAbortedError on signal abort', async () => {
        const source = createPushableAsyncIterable<StreamEvent>();
        const controller = new AbortController();
        const chatStream = createChatStream(source.iterable, {
            signal: controller.signal,
        });
        const iterator = chatStream[Symbol.asyncIterator]();

        source.push({ type: 'text-delta', text: 'partial' });

        expect(await iterator.next()).toEqual({
            done: false,
            value: { type: 'text-delta', text: 'partial' },
        });

        controller.abort();

        await expect(chatStream.result).rejects.toBeInstanceOf(
            StreamAbortedError
        );
        await expect(chatStream.events).resolves.toEqual([
            { type: 'text-delta', text: 'partial' },
        ]);
        await expect(iterator.next()).rejects.toBeInstanceOf(
            StreamAbortedError
        );

        const replayIterator = chatStream[Symbol.asyncIterator]();
        expect(await replayIterator.next()).toEqual({
            done: false,
            value: { type: 'text-delta', text: 'partial' },
        });
        await expect(replayIterator.next()).rejects.toBeInstanceOf(
            StreamAbortedError
        );
    });

    it('should reject immediately when created with an already-aborted signal', async () => {
        const controller = new AbortController();
        controller.abort();
        const next = vi.fn(async () => ({
            done: false as const,
            value: { type: 'text-delta', text: 'late event' } satisfies StreamEvent,
        }));
        const chatStream = createChatStream(
            {
                [Symbol.asyncIterator]() {
                    return {
                        next,
                    };
                },
            },
            {
                signal: controller.signal,
            }
        );

        await expect(chatStream.result).rejects.toBeInstanceOf(
            StreamAbortedError
        );
        await expect(chatStream.events).resolves.toEqual([]);
        await expect(
            chatStream[Symbol.asyncIterator]().next()
        ).rejects.toBeInstanceOf(StreamAbortedError);
        expect(next).not.toHaveBeenCalled();
    });
});
