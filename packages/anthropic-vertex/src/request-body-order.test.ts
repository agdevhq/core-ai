import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool, type Message } from '@core-ai/core-ai';
import {
    createAnthropicCapturingFetch,
    type CapturingFetch,
} from '@core-ai/testing';

import { createAnthropicVertex } from './provider.ts';

// See createStreamRequest in @core-ai/anthropic for why key order matters.
// The Vertex SDK re-serializes the body (dropping `model`, appending
// `anthropic_version`), so these tests check the body that goes over the wire.

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
    it('should put the prompt before per-request settings for chat requests', async () => {
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
        expectPromptBeforeSettings(
            Object.keys(bodies[0] ?? {}),
            ['tools', 'system', 'messages'],
            [
                'tool_choice',
                'max_tokens',
                'thinking',
                'output_config',
                'cache_control',
            ]
        );
    });

    it('should put the prompt before per-request settings for object requests', async () => {
        const { fetch, bodies } = createAnthropicCapturingFetch('{"answer":4}');
        const model = createAnthropicVertex({
            client: createVertexClient(fetch),
        }).chatModel('claude-sonnet-4-6');

        await model.generateObject({
            messages,
            schema: z.object({ answer: z.number() }),
        });

        expect(bodies).toHaveLength(1);
        expectPromptBeforeSettings(
            Object.keys(bodies[0] ?? {}),
            ['system', 'messages'],
            ['max_tokens', 'output_config']
        );
    });
});

function expectPromptBeforeSettings(
    keys: string[],
    prompt: string[],
    settings: string[]
) {
    expect(keys.slice(0, prompt.length)).toEqual(prompt);
    expect(keys.slice(-2)).toEqual(['stream', 'anthropic_version']);
    expect(keys.slice(prompt.length, -2)).toEqual(
        expect.arrayContaining(settings)
    );
}

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
