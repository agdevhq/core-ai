import { describe, expect, it } from 'vitest';
import { toAsyncIterable } from '@core-ai/testing';
import { createStreamResult } from './stream.ts';
import type { StreamEvent } from './types.ts';

describe('createStreamResult', () => {
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
        const result = createStreamResult(toAsyncIterable(events));
        const collected: StreamEvent[] = [];

        for await (const event of result) {
            collected.push(event);
        }

        expect(collected).toEqual(events);
    });

    it('should aggregate content via toResponse()', async () => {
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
        const result = createStreamResult(toAsyncIterable(events));
        const response = await result.toResponse();

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
        const result = createStreamResult(toAsyncIterable(events));
        const response = await result.toResponse();

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
                providerMetadata: { encryptedContent: 'enc_abc' },
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
        const result = createStreamResult(toAsyncIterable(events));
        const response = await result.toResponse();

        expect(response.parts).toEqual([
            {
                type: 'reasoning',
                text: 'thinking',
                providerMetadata: { encryptedContent: 'enc_abc' },
            },
        ]);
    });

    it('should auto-consume stream when toResponse called without iteration', async () => {
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
        const result = createStreamResult(toAsyncIterable(events));
        const response = await result.toResponse();

        expect(response.content).toBe('auto');
        expect(response.reasoning).toBeNull();
    });
});
