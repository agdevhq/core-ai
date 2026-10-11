import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool, type Message } from '@core-ai/core-ai';
import {
    createAnthropicCapturingFetch,
    type CapturingFetch,
} from '@core-ai/testing';

import { createAnthropicVertex } from './provider.ts';

// Vertex AI multi-region and global endpoints were observed to route cache
// lookups by the leading bytes of the JSON body, so the body must start with
// the prompt prefix. The Vertex SDK re-serializes the body (dropping `model`,
// appending `anthropic_version`), so these tests check the body that actually
// goes over the wire.

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
        const { fetch, bodies } = createAnthropicCapturingFetch();
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
        const keys = Object.keys(bodies[0] ?? {});
        expect(keys.slice(0, 3)).toEqual(['system', 'tools', 'tool_choice']);
        expect(keys.slice(-3)).toEqual([
            'messages',
            'stream',
            'anthropic_version',
        ]);
        expect(keys).toEqual(
            expect.arrayContaining([
                'max_tokens',
                'thinking',
                'output_config',
                'cache_control',
            ])
        );
    });

    it('should serialize the prompt prefix before messages for object requests', async () => {
        const { fetch, bodies } = createAnthropicCapturingFetch('{"answer":4}');
        const model = createAnthropicVertex({
            client: createVertexClient(fetch),
        }).chatModel('claude-sonnet-4-6');

        await model.generateObject({
            messages,
            schema: z.object({ answer: z.number() }),
        });

        expect(bodies).toHaveLength(1);
        const keys = Object.keys(bodies[0] ?? {});
        expect(keys[0]).toBe('system');
        expect(keys.slice(-3)).toEqual([
            'messages',
            'stream',
            'anthropic_version',
        ]);
        expect(keys).toEqual(
            expect.arrayContaining(['max_tokens', 'output_config'])
        );
    });
});

function createVertexClient(fetch: CapturingFetch['fetch']): AnthropicVertex {
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
