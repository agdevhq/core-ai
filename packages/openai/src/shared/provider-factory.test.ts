import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import type { ModelCapabilities } from '@core-ai/core-ai';

import { openaiResponsesGenerateProviderOptionsSchema } from '../provider-options.js';
import { createOpenAIProvider } from './provider-factory.js';
import { TEXT_ONLY_MODALITIES } from '@core-ai/core-ai';

const CAPABILITIES: ModelCapabilities = {
    reasoning: {
        mode: 'unsupported',
        supportedEfforts: [],
        restrictsSamplingParams: false,
        supportedToolChoices: ['auto', 'none', 'required', 'tool'],
    },
    modalities: TEXT_ONLY_MODALITIES,
    tools: {
        strictSchemas: { supported: false },
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

    it('should advertise audio only on Chat Completions audio models', () => {
        const provider = createOpenAIProvider({
            client: createMockClient(),
        });

        expect(
            provider.chatModel('gpt-audio-1.5').capabilities.modalities.input
        ).toEqual(['text']);
        expect(
            provider.chat.chatModel('gpt-audio-1.5').capabilities.modalities
                .input
        ).toEqual(['text', 'audio']);
    });

    it('should report strict schemas supported for unknown model ids', () => {
        const provider = createOpenAIProvider({ client: createMockClient() });

        expect(
            provider.chatModel('opaque-model').capabilities.tools.strictSchemas
        ).toEqual({ supported: true });
        expect(
            provider.chat.chatModel('ft:gpt-4o-2024-08-06:acme::abc123')
                .capabilities.tools.strictSchemas
        ).toEqual({ supported: true });
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

    it('should ignore chat provider options under another provider id', async () => {
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
                openai: { seed: 42 },
            },
        });

        expect(create).toHaveBeenCalledWith(
            expect.not.objectContaining({ seed: 42 }),
            expect.any(Object)
        );
    });

    it('should read responses provider options from the provider namespace', async () => {
        const create = vi.fn(async () => createResponse());
        const provider = createOpenAIProvider(
            { client: createMockResponsesClient(create) },
            { providerId: 'custom' }
        );

        await provider.chatModel('custom-model').generate({
            messages: [{ role: 'user', content: 'hello' }],
            providerOptions: {
                custom: { promptCacheKey: 'conversation-1' },
                openai: { user: 'ignored' },
            },
        });

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({ prompt_cache_key: 'conversation-1' }),
            expect.any(Object)
        );
        expect(create).not.toHaveBeenCalledWith(
            expect.objectContaining({ user: 'ignored' }),
            expect.any(Object)
        );
    });

    it('should validate responses provider options with a custom schema', async () => {
        const create = vi.fn(async () => createResponse());
        const provider = createOpenAIProvider(
            { client: createMockResponsesClient(create) },
            {
                providerId: 'custom',
                responsesProviderOptionsSchema:
                    openaiResponsesGenerateProviderOptionsSchema.pick({
                        user: true,
                    }),
            }
        );

        await expect(
            provider.chatModel('custom-model').generate({
                messages: [{ role: 'user', content: 'hello' }],
                providerOptions: {
                    custom: { store: true },
                },
            })
        ).rejects.toThrowError(/unrecognized key/i);
        expect(create).not.toHaveBeenCalled();
    });
});

function createMockResponsesClient(
    create: (options: unknown, requestOptions?: unknown) => Promise<unknown>
): OpenAI {
    return { responses: { create } } as unknown as OpenAI;
}

function createResponse() {
    return {
        output: [
            {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'Done' }],
            },
        ],
        status: 'completed',
        usage: {
            input_tokens: 1,
            output_tokens: 1,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 0 },
            total_tokens: 2,
        },
    };
}

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
