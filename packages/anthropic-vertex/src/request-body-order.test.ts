import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool, type Message } from '@core-ai/core-ai';

import { createAnthropicVertex } from './provider.ts';

// Vertex AI multi-region and global endpoints route cache lookups by the
// leading bytes of the JSON body, so the stable prompt prefix must serialize
// before `messages`. The Vertex SDK re-serializes the body (dropping `model`,
// appending `anthropic_version`), so these tests pin the order of the body
// that actually goes over the wire.

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

describe('Anthropic Vertex request body key order', () => {
    it('should serialize the prompt prefix before messages for chat requests', async () => {
        const { fetch, bodies } = createCapturingFetch();
        const model = createAnthropicVertex({
            client: createVertexClient(fetch),
        }).chatModel('claude-sonnet-4-6');

        await model.generate({
            messages,
            tools,
            toolChoice: 'auto',
            reasoning: { effort: 'low' },
            providerOptions: {
                'anthropic-vertex': {
                    cacheControl: { type: 'ephemeral' },
                },
            },
        });

        expect(bodies).toHaveLength(1);
        expect(Object.keys(bodies[0] ?? {})).toEqual([
            'max_tokens',
            'system',
            'tools',
            'tool_choice',
            'thinking',
            'output_config',
            'cache_control',
            'messages',
            'stream',
            'anthropic_version',
        ]);
    });

    it('should serialize the prompt prefix before messages for object requests', async () => {
        const { fetch, bodies } = createCapturingFetch('{"answer":4}');
        const model = createAnthropicVertex({
            client: createVertexClient(fetch),
        }).chatModel('claude-sonnet-4-6');

        await model.generateObject({
            messages,
            schema: z.object({ answer: z.number() }),
        });

        expect(bodies).toHaveLength(1);
        expect(Object.keys(bodies[0] ?? {})).toEqual([
            'max_tokens',
            'system',
            'output_config',
            'messages',
            'stream',
            'anthropic_version',
        ]);
    });
});

type Fetch = (
    input: string | URL | Request,
    init?: RequestInit
) => Promise<Response>;

function createVertexClient(fetch: Fetch): AnthropicVertex {
    const authClient = {
        projectId: 'my-project',
        getRequestHeaders: async () =>
            new Headers({ authorization: 'Bearer test' }),
    };
    return new AnthropicVertex({
        projectId: 'my-project',
        region: 'global',
        // Only the two members above are read by the SDK's request adapter.
        authClient: authClient as unknown as NonNullable<
            ConstructorParameters<typeof AnthropicVertex>[0]
        >['authClient'],
        fetch,
        maxRetries: 0,
    });
}

function createCapturingFetch(text = 'ok') {
    const bodies: Record<string, unknown>[] = [];
    const fetch: Fetch = async (_input, init) => {
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
