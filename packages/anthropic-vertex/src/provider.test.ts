import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
    defineTool,
    ProviderError,
    ToolSchemaStrictnessError,
} from '@core-ai/core-ai';
import type { AnthropicChatClient } from '@core-ai/anthropic';
import { toAsyncIterable } from '@core-ai/testing';

import { createAnthropicVertex } from './provider.ts';

const { anthropicVertexConstructor, messagesCreate } = vi.hoisted(() => ({
    anthropicVertexConstructor: vi.fn(),
    messagesCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/vertex-sdk', () => ({
    AnthropicVertex: class {
        messages = {
            create: messagesCreate,
        };

        constructor(options: unknown) {
            anthropicVertexConstructor(options);
        }
    },
}));

function createMessageResponse() {
    return toAsyncIterable([
        {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: 1 },
        },
        { type: 'message_stop' },
    ]);
}

describe('createAnthropicVertex', () => {
    beforeEach(() => {
        anthropicVertexConstructor.mockReset();
        messagesCreate.mockReset();
    });

    it('should throw when projectId is missing and no client is provided', () => {
        expect(() =>
            createAnthropicVertex({ region: 'europe-west1' })
        ).toThrowError(/projectId is required/);
        expect(anthropicVertexConstructor).not.toHaveBeenCalled();
    });

    it('should throw when region is missing and no client is provided', () => {
        expect(() =>
            createAnthropicVertex({ projectId: 'my-project' })
        ).toThrowError(/region is required/);
    });

    it('should construct an AnthropicVertex client using Application Default Credentials by default', () => {
        createAnthropicVertex({
            projectId: 'my-project',
            region: 'europe-west1',
        });

        expect(anthropicVertexConstructor).toHaveBeenCalledWith({
            projectId: 'my-project',
            region: 'europe-west1',
        });
    });

    it('should construct a GoogleAuth-backed client when service account credentials are provided', () => {
        createAnthropicVertex({
            projectId: 'my-project',
            region: 'europe-west1',
            credentials: {
                client_email: 'test@my-project.iam.gserviceaccount.com',
                private_key: 'test-key',
            },
        });

        expect(anthropicVertexConstructor).toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: 'my-project',
                region: 'europe-west1',
                googleAuth: expect.anything(),
            })
        );
    });

    it('should not construct an AnthropicVertex client when one is injected', () => {
        const client: AnthropicChatClient = {
            messages: { create: messagesCreate },
        };

        createAnthropicVertex({ client });

        expect(anthropicVertexConstructor).not.toHaveBeenCalled();
    });

    it('should expose a chat model with the anthropic-vertex provider id', () => {
        const provider = createAnthropicVertex({
            projectId: 'my-project',
            region: 'europe-west1',
        });

        const chatModel = provider.chatModel('claude-sonnet-4-6');

        expect(chatModel.provider).toBe('anthropic-vertex');
        expect(chatModel.modelId).toBe('claude-sonnet-4-6');
    });

    it('should use default max tokens in generated requests', async () => {
        messagesCreate.mockResolvedValue(createMessageResponse());

        const provider = createAnthropicVertex({
            projectId: 'my-project',
            region: 'europe-west1',
            defaultMaxTokens: 2048,
        });

        await provider
            .chatModel('claude-sonnet-4-6')
            .generate({ messages: [{ role: 'user', content: 'hello' }] });

        expect(messagesCreate).toHaveBeenCalledWith(
            expect.objectContaining({ max_tokens: 2048 }),
            expect.objectContaining({ signal: undefined })
        );
    });

    it('should forward per-tool strictness and expose model capabilities', async () => {
        messagesCreate.mockResolvedValue(createMessageResponse());
        const provider = createAnthropicVertex({
            projectId: 'my-project',
            region: 'europe-west1',
        });
        const model = provider.chatModel('claude-sonnet-4-6');

        expect(model.capabilities.tools.strictSchemas).toEqual({
            supported: true,
            maxStrictTools: 20,
        });

        await model.generate({
            messages: [{ role: 'user', content: 'hello' }],
            tools: {
                search: defineTool({
                    name: 'search',
                    description: 'Search the web',
                    parameters: z.object({ query: z.string() }),
                    strict: true,
                }),
                fetch: defineTool({
                    name: 'fetch',
                    description: 'Fetch a page',
                    parameters: z.object({ url: z.string() }),
                }),
            },
        });

        expect(messagesCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                tools: [
                    expect.objectContaining({ name: 'search', strict: true }),
                    expect.not.objectContaining({ strict: expect.anything() }),
                ],
            }),
            expect.objectContaining({ signal: undefined })
        );
    });

    it('should reject explicit strictness for known-unsupported models', async () => {
        const provider = createAnthropicVertex({
            projectId: 'my-project',
            region: 'europe-west1',
        });

        const error = await provider
            .chatModel('claude-sonnet-4')
            .generate({
                messages: [{ role: 'user', content: 'hello' }],
                tools: {
                    search: defineTool({
                        name: 'search',
                        description: 'Search the web',
                        parameters: z.object({ query: z.string() }),
                        strict: true,
                    }),
                },
            })
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ToolSchemaStrictnessError);
        expect(error).toMatchObject({
            provider: 'anthropic-vertex',
            reason: 'unsupported',
        });
        expect(messagesCreate).not.toHaveBeenCalled();
    });

    it('should read provider options from the anthropic-vertex key only', async () => {
        messagesCreate.mockResolvedValue(createMessageResponse());
        const model = createAnthropicVertex({
            projectId: 'my-project',
            region: 'europe-west1',
        }).chatModel('claude-sonnet-4-6');

        await model.generate({
            messages: [{ role: 'user', content: 'hello' }],
            providerOptions: {
                'anthropic-vertex': {
                    stopSequences: ['STOP'],
                    betas: ['custom-beta'],
                },
                anthropic: { topK: 5, betas: ['ignored-beta'] },
            },
        });

        const [request, requestOptions] = messagesCreate.mock.calls[0] ?? [];
        expect(request).toMatchObject({ stop_sequences: ['STOP'] });
        expect(request).not.toHaveProperty('top_k');
        expect(requestOptions).toMatchObject({
            headers: { 'anthropic-beta': 'custom-beta' },
        });
    });

    it('should read system message cache control from the anthropic-vertex key only', async () => {
        messagesCreate.mockResolvedValue(createMessageResponse());
        const model = createAnthropicVertex({
            projectId: 'my-project',
            region: 'europe-west1',
        }).chatModel('claude-sonnet-4-6');

        await model.generate({
            messages: [
                {
                    role: 'system',
                    content: 'Stable instructions.',
                    providerOptions: {
                        'anthropic-vertex': {
                            cacheControl: { type: 'ephemeral', ttl: '1h' },
                        },
                    },
                },
                {
                    role: 'system',
                    content: 'More instructions.',
                    providerOptions: {
                        anthropic: { cacheControl: { type: 'ephemeral' } },
                    },
                },
                { role: 'user', content: 'hello' },
            ],
        });

        const [request] = messagesCreate.mock.calls[0] ?? [];
        expect(request).toMatchObject({
            system: [
                {
                    type: 'text',
                    text: 'Stable instructions.',
                    cache_control: { type: 'ephemeral', ttl: '1h' },
                },
                { type: 'text', text: 'More instructions.' },
            ],
        });
        expect((request as { system: unknown[] }).system[1]).not.toHaveProperty(
            'cache_control'
        );
    });

    it('should tag errors with provider "anthropic-vertex"', async () => {
        messagesCreate.mockRejectedValue(new Error('upstream failure'));

        const provider = createAnthropicVertex({
            projectId: 'my-project',
            region: 'europe-west1',
        });

        const error = await provider
            .chatModel('claude-sonnet-4-6')
            .generate({ messages: [{ role: 'user', content: 'hello' }] })
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).provider).toBe('anthropic-vertex');
    });
});
