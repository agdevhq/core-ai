import { toAsyncIterable } from '@core-ai/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { finalizeGenerateResult } from './finalize-result.ts';
import { createChatStream } from './stream.ts';
import type {
    GenerateResult,
    StreamEvent,
    ToolCall,
    ToolSet,
} from './types.ts';

const tools = {
    search: {
        name: 'search',
        description: 'Search the web',
        parameters: z.object({ limit: z.coerce.number() }),
    },
    lookup: {
        name: 'lookup',
        description: 'Look up a record',
        parameters: {
            type: 'object',
            properties: { id: { type: 'string' } },
        },
    },
} satisfies ToolSet;

const usage: GenerateResult['usage'] = {
    inputTokens: 1,
    outputTokens: 1,
    inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: 0 },
    outputTokenDetails: {},
};

function createResult(toolCalls: ToolCall[]): GenerateResult {
    return {
        parts: toolCalls.map((toolCall) => ({ type: 'tool-call', toolCall })),
        content: null,
        reasoning: null,
        toolCalls,
        finishReason: 'tool-calls',
        usage,
    };
}

describe('finalizeGenerateResult', () => {
    it('reports validation outcomes for Standard Schema tools', async () => {
        const result = await finalizeGenerateResult(
            createResult([
                { id: '1', name: 'search', arguments: { limit: '5' } },
                { id: '2', name: 'search', arguments: { limit: 'many' } },
            ]),
            { tools }
        );

        expect(result.toolCalls[0]).toEqual({
            id: '1',
            name: 'search',
            arguments: { limit: '5' },
            validation: { value: { limit: 5 } },
        });
        expect(result.toolCalls[1]?.validation?.issues).toHaveLength(1);
        expect(result.parts).toEqual(
            result.toolCalls.map((toolCall) => ({
                type: 'tool-call',
                toolCall,
            }))
        );
    });

    it('leaves calls to plain JSON Schema and unknown tools unvalidated', async () => {
        const toolCalls: ToolCall[] = [
            { id: '1', name: 'lookup', arguments: { id: 7 } },
            { id: '2', name: 'unknown', arguments: {} },
        ];

        const result = await finalizeGenerateResult(createResult(toolCalls), {
            tools,
        });

        expect(result.toolCalls).toEqual(toolCalls);
    });

    it('matches tools by name, not by tool set key', async () => {
        const result = await finalizeGenerateResult(
            createResult([{ id: '1', name: 'web_search', arguments: {} }]),
            { tools: { search: { ...tools.search, name: 'web_search' } } }
        );

        expect(result.toolCalls[0]?.validation?.issues).toHaveLength(1);
    });
});

describe('createChatStream with a request', () => {
    it('validates tool calls when they complete', async () => {
        const events: StreamEvent[] = [
            { type: 'tool-call-start', toolCallId: '1', toolName: 'search' },
            {
                type: 'tool-call-delta',
                toolCallId: '1',
                argumentsDelta: '{"limit":"2"}',
            },
            {
                type: 'tool-call-end',
                toolCall: {
                    id: '1',
                    name: 'search',
                    arguments: { limit: '2' },
                },
            },
            { type: 'finish', finishReason: 'tool-calls', usage },
        ];

        const stream = createChatStream(toAsyncIterable(events), {
            request: { tools },
        });
        const streamed: StreamEvent[] = [];
        for await (const event of stream) {
            streamed.push(event);
        }
        const result = await stream.result;

        expect(streamed[2]).toEqual({
            type: 'tool-call-end',
            toolCall: {
                id: '1',
                name: 'search',
                arguments: { limit: '2' },
                validation: { value: { limit: 2 } },
            },
        });
        expect(result.toolCalls[0]?.validation).toEqual({
            value: { limit: 2 },
        });
    });
});
