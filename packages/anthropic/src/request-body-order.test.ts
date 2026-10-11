import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool, type Message } from '@core-ai/core-ai';
import { createAnthropicCapturingFetch } from '@core-ai/testing';

import { createAnthropic } from './provider.ts';

// Vertex AI multi-region and global endpoints were observed to route cache
// lookups by the leading bytes of the JSON body, so the body must start with
// the prompt prefix and end with `messages`. These tests check the body that
// actually leaves the SDK.

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
        const { fetch, bodies } = createAnthropicCapturingFetch();
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
        expectMessagesAfterPrefix(Object.keys(bodies[0] ?? {}), [
            'max_tokens',
            'thinking',
            'output_config',
            'cache_control',
            'stop_sequences',
        ]);
    });

    it('should serialize the prompt prefix before messages for object requests', async () => {
        const { fetch, bodies } = createAnthropicCapturingFetch('{"answer":4}');
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
        const keys = Object.keys(bodies[0] ?? {});
        expect(keys.slice(0, 2)).toEqual(['model', 'system']);
        expect(keys.slice(-2)).toEqual(['messages', 'stream']);
        expect(keys).toEqual(
            expect.arrayContaining([
                'max_tokens',
                'temperature',
                'top_k',
                'output_config',
            ])
        );
    });
});

function expectMessagesAfterPrefix(keys: string[], settings: string[]) {
    expect(keys.slice(0, 4)).toEqual([
        'model',
        'system',
        'tools',
        'tool_choice',
    ]);
    expect(keys.slice(-2)).toEqual(['messages', 'stream']);
    expect(keys).toEqual(expect.arrayContaining(settings));
}
