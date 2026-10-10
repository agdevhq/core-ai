import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool, type Message } from '@core-ai/core-ai';

import { createAnthropic } from './provider.ts';

// Vertex AI multi-region and global endpoints route cache lookups by the
// leading bytes of the JSON body, so the stable prompt prefix must serialize
// before `messages`. These tests pin the order of the body that actually
// leaves the SDK.

const messages: Message[] = [
    { role: 'system', content: 'You are terse.' },
    { role: 'user', content: 'hello' },
];

const tools = {
    search: defineTool({
        name: 'search',
        description: 'Search the web',
        parameters: z.object({ query: z.string() }),
    }),
};

describe('Anthropic request body key order', () => {
    it('should serialize the prompt prefix before messages for chat requests', async () => {
        const { fetch, bodies } = createCapturingFetch();
        const model = createAnthropic({
            client: new Anthropic({ apiKey: 'test', fetch, maxRetries: 0 }),
        }).chatModel('claude-sonnet-4-6');

        await model.generate({
            messages,
            tools,
            toolChoice: 'auto',
            reasoning: { effort: 'low' },
            providerOptions: {
                anthropic: {
                    cacheControl: { type: 'ephemeral' },
                    stopSequences: ['END'],
                },
            },
        });

        expect(bodies).toHaveLength(1);
        expect(Object.keys(bodies[0] ?? {})).toEqual([
            'model',
            'max_tokens',
            'system',
            'tools',
            'tool_choice',
            'thinking',
            'output_config',
            'cache_control',
            'stop_sequences',
            'messages',
            'stream',
        ]);
    });

    it('should serialize the prompt prefix before messages for object requests', async () => {
        const { fetch, bodies } = createCapturingFetch('{"answer":4}');
        const model = createAnthropic({
            client: new Anthropic({ apiKey: 'test', fetch, maxRetries: 0 }),
        }).chatModel('claude-sonnet-4-6');

        await model.generateObject({
            messages,
            schema: z.object({ answer: z.number() }),
            temperature: 0.2,
            providerOptions: { anthropic: { topK: 5 } },
        });

        expect(bodies).toHaveLength(1);
        expect(Object.keys(bodies[0] ?? {})).toEqual([
            'model',
            'max_tokens',
            'system',
            'temperature',
            'top_k',
            'output_config',
            'messages',
            'stream',
        ]);
    });
});

function createCapturingFetch(text = 'ok') {
    const bodies: Record<string, unknown>[] = [];
    const fetch = async (
        _input: string | URL | Request,
        init?: RequestInit
    ): Promise<Response> => {
        if (typeof init?.body === 'string') {
            bodies.push(JSON.parse(init.body) as Record<string, unknown>);
        }
        return createSseResponse([
            {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'text', text: '' },
            },
            {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text },
            },
            { type: 'content_block_stop', index: 0 },
            {
                type: 'message_delta',
                delta: { stop_reason: 'end_turn', stop_sequence: null },
                usage: { output_tokens: 1 },
            },
            { type: 'message_stop' },
        ]);
    };
    return { fetch, bodies };
}

function createSseResponse(
    events: ({ type: string } & Record<string, unknown>)[]
): Response {
    const body = events
        .map(
            (event) =>
                `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
        )
        .join('');
    return new Response(body, {
        headers: { 'content-type': 'text/event-stream' },
    });
}
