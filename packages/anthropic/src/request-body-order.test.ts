import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool, type Message } from '@core-ai/core-ai';
import { createAnthropicCapturingFetch } from '@core-ai/testing';

import { createAnthropic } from './provider.ts';

// See createStreamRequest for why key order matters. These tests check the
// body that actually leaves the SDK.

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
    it('should put the prompt before per-request settings for chat requests', async () => {
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
        expectPromptBeforeSettings(
            Object.keys(bodies[0] ?? {}),
            ['model', 'system', 'tools', 'messages'],
            [
                'tool_choice',
                'max_tokens',
                'thinking',
                'output_config',
                'cache_control',
                'stop_sequences',
            ]
        );
    });

    it('should put the prompt before per-request settings for object requests', async () => {
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
        expectPromptBeforeSettings(
            Object.keys(bodies[0] ?? {}),
            ['model', 'system', 'messages'],
            ['max_tokens', 'temperature', 'top_k', 'output_config']
        );
    });

    it('should start with tools when there is no system prompt', async () => {
        const { fetch, bodies } = createAnthropicCapturingFetch();
        const model = createAnthropic({
            client: new Anthropic({ apiKey: 'test', fetch, maxRetries: 0 }),
        }).chatModel('claude-sonnet-4-6');

        await model.generate({
            messages: [{ role: 'user', content: 'hello' }],
            tools,
        });

        expectPromptBeforeSettings(
            Object.keys(bodies[0] ?? {}),
            ['model', 'tools', 'messages'],
            ['max_tokens']
        );
    });
});

function expectPromptBeforeSettings(
    keys: string[],
    prompt: string[],
    settings: string[]
) {
    expect(keys.slice(0, prompt.length)).toEqual(prompt);
    expect(keys.at(-1)).toBe('stream');
    expect(keys.slice(prompt.length, -1)).toEqual(
        expect.arrayContaining(settings)
    );
}
