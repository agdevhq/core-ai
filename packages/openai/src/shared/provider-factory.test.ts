import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import type { ModelCapabilities } from '@core-ai/core-ai';

import { createOpenAIProvider } from './provider-factory.js';

const CAPABILITIES: ModelCapabilities = {
    reasoning: {
        mode: 'unsupported',
        supportedEfforts: [],
        restrictsSamplingParams: false,
        supportedToolChoices: ['auto', 'none', 'required', 'tool'],
    },
    modalities: {
        imageInput: {
            supported: false,
            supportedSources: [],
        },
    },
};

describe('createOpenAIProvider', () => {
    it('should apply registered capabilities to both chat APIs', () => {
        const provider = createOpenAIProvider(
            { client: createMockClient() },
            {
                modelCapabilities: {
                    'custom-model': CAPABILITIES,
                },
            }
        );

        expect(provider.chatModel('custom-model').capabilities).toBe(
            CAPABILITIES
        );
        expect(provider.chat.chatModel('custom-model').capabilities).toBe(
            CAPABILITIES
        );
    });

    it('should read chat provider options from the provider namespace', async () => {
        const create = vi.fn(async () => createChatCompletion());
        const provider = createOpenAIProvider(
            { client: createMockClient(create) },
            {
                providerId: 'custom',
                defaultApi: 'chat-completions',
            }
        );

        await provider.chatModel('custom-model').generate({
            messages: [{ role: 'user', content: 'hello' }],
            providerOptions: {
                custom: { seed: 42 },
            },
        });

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({ seed: 42 }),
            expect.any(Object)
        );
    });

    it('should support an explicit provider options namespace', async () => {
        const create = vi.fn(async () => createChatCompletion());
        const provider = createOpenAIProvider(
            { client: createMockClient(create) },
            {
                providerId: 'custom',
                providerOptionsKey: 'openai',
                defaultApi: 'chat-completions',
            }
        );

        await provider.chatModel('custom-model').generate({
            messages: [{ role: 'user', content: 'hello' }],
            providerOptions: {
                openai: { seed: 42 },
            },
        });

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({ seed: 42 }),
            expect.any(Object)
        );
    });
});

function createMockClient(
    create?: (options: unknown, requestOptions?: unknown) => Promise<unknown>
): OpenAI {
    return {
        chat: {
            completions: {
                create:
                    create ??
                    (async () => {
                        throw new Error('not implemented');
                    }),
            },
        },
    } as unknown as OpenAI;
}

function createChatCompletion() {
    return {
        id: 'chatcmpl-1',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'custom-model',
        choices: [
            {
                index: 0,
                finish_reason: 'stop' as const,
                logprobs: null,
                message: {
                    role: 'assistant' as const,
                    content: 'Done',
                    refusal: null,
                },
            },
        ],
    };
}
