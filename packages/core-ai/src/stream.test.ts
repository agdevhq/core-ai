import { describe, expect, it } from 'vitest';
import { createStreamResult } from './stream.ts';
import type { StreamEvent } from './types.ts';

describe('createStreamResult', () => {
    it('should iterate over all events', async () => {
        const events: StreamEvent[] = [
            { type: 'content-delta', text: 'Hello' },
            { type: 'content-delta', text: ' world' },
            {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                    inputTokens: 10,
                    outputTokens: 5,
                    reasoningTokens: 0,
                    totalTokens: 15,
                },
            },
        ];
        const result = createStreamResult(toAsyncIterable(events));
        const collected: StreamEvent[] = [];

        for await (const event of result) {
            collected.push(event);
        }

        expect(collected).toEqual(events);
    });

    it('should aggregate content via toResponse()', async () => {
        const events: StreamEvent[] = [
            { type: 'content-delta', text: 'Hello' },
            { type: 'content-delta', text: ' world' },
            {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                    inputTokens: 10,
                    outputTokens: 5,
                    reasoningTokens: 0,
                    totalTokens: 15,
                },
            },
        ];
        const result = createStreamResult(toAsyncIterable(events));
        const response = await result.toResponse();

        expect(response.content).toBe('Hello world');
        expect(response.finishReason).toBe('stop');
        expect(response.toolCalls).toEqual([]);
        expect(response.usage).toEqual({
            inputTokens: 10,
            outputTokens: 5,
            reasoningTokens: 0,
            totalTokens: 15,
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
                    reasoningTokens: 0,
                    totalTokens: 30,
                },
            },
        ];
        const result = createStreamResult(toAsyncIterable(events));
        const response = await result.toResponse();

        expect(response.toolCalls).toEqual([
            {
                id: 'tc1',
                name: 'search',
                arguments: { query: 'hello' },
            },
        ]);
        expect(response.finishReason).toBe('tool-calls');
    });

    it('should auto-consume stream when toResponse called without iteration', async () => {
        const events: StreamEvent[] = [
            { type: 'content-delta', text: 'auto' },
            {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                    inputTokens: 1,
                    outputTokens: 1,
                    reasoningTokens: 0,
                    totalTokens: 2,
                },
            },
        ];
        const result = createStreamResult(toAsyncIterable(events));
        const response = await result.toResponse();

        expect(response.content).toBe('auto');
    });
});

async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
    for (const item of items) {
        yield item;
    }
}
