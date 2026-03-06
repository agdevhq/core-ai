import { describe, expect, it, vi } from 'vitest';
import { toAsyncIterable } from '@core-ai/testing';
import { StreamAbortedError } from './errors.ts';
import { createChatStream } from './stream.ts';
import type { StreamEvent } from './types.ts';

type PushableEntry<T> =
    | { type: 'value'; value: T }
    | { type: 'finish' }
    | { type: 'error'; error: unknown };

function createPushableAsyncIterable<T>(): {
    iterable: AsyncIterable<T>;
    push(value: T): void;
    finish(): void;
    fail(error: unknown): void;
} {
    const queue: PushableEntry<T>[] = [];
    let resolveNext: ((entry: PushableEntry<T>) => void) | undefined;

    function enqueue(entry: PushableEntry<T>): void {
        if (resolveNext) {
            const resolve = resolveNext;
            resolveNext = undefined;
            resolve(entry);
            return;
        }
        queue.push(entry);
    }

    return {
        iterable: {
            async *[Symbol.asyncIterator]() {
                while (true) {
                    const entry =
                        queue.shift() ??
                        (await new Promise<PushableEntry<T>>((resolve) => {
                            resolveNext = resolve;
                        }));

                    if (entry.type === 'value') {
                        yield entry.value;
                        continue;
                    }

                    if (entry.type === 'finish') {
                        return;
                    }

                    throw entry.error;
                }
            },
        },
        push(value) {
            enqueue({
                type: 'value',
                value,
            });
        },
        finish() {
            enqueue({ type: 'finish' });
        },
        fail(error) {
            enqueue({
                type: 'error',
                error,
            });
        },
    };
}

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

    it('should reject result and iterators with StreamAbortedError on abort', async () => {
        const source = createPushableAsyncIterable<StreamEvent>();
        const abort = vi.fn();
        const chatStream = createChatStream(source.iterable, { abort });
        const iterator = chatStream[Symbol.asyncIterator]();

        source.push({ type: 'text-delta', text: 'partial' });

        expect(await iterator.next()).toEqual({
            done: false,
            value: { type: 'text-delta', text: 'partial' },
        });

        chatStream.abort();
        chatStream.abort();

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
        expect(abort).toHaveBeenCalledTimes(1);
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
                abortSignal: controller.signal,
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
