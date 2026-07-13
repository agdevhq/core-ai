import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '@core-ai/core-ai';
import type { AnthropicChatClient } from '@core-ai/anthropic/compat';
import { createVertexAnthropic } from './provider.js';

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

describe('createVertexAnthropic', () => {
    beforeEach(() => {
        anthropicVertexConstructor.mockReset();
        messagesCreate.mockReset();
    });

    it('should throw when projectId is missing and no client is provided', () => {
        expect(() =>
            createVertexAnthropic({ region: 'europe-west1' })
        ).toThrowError(/projectId is required/);
        expect(anthropicVertexConstructor).not.toHaveBeenCalled();
    });

    it('should throw when region is missing and no client is provided', () => {
        expect(() =>
            createVertexAnthropic({ projectId: 'my-project' })
        ).toThrowError(/region is required/);
        expect(anthropicVertexConstructor).not.toHaveBeenCalled();
    });

    it('should construct an AnthropicVertex client using Application Default Credentials by default', () => {
        createVertexAnthropic({
            projectId: 'my-project',
            region: 'europe-west1',
        });

        expect(anthropicVertexConstructor).toHaveBeenCalledWith({
            projectId: 'my-project',
            region: 'europe-west1',
        });
    });

    it('should construct a GoogleAuth-backed client when service account credentials are provided', () => {
        createVertexAnthropic({
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

        createVertexAnthropic({ client });

        expect(anthropicVertexConstructor).not.toHaveBeenCalled();
    });

    it('should expose a chat model with the vertex-anthropic provider id', () => {
        const provider = createVertexAnthropic({
            projectId: 'my-project',
            region: 'europe-west1',
        });

        const chatModel = provider.chatModel('claude-sonnet-4-6');

        expect(chatModel.provider).toBe('vertex-anthropic');
        expect(chatModel.modelId).toBe('claude-sonnet-4-6');
    });

    it('should use default max tokens in generated requests', async () => {
        messagesCreate.mockResolvedValue({
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            model: 'claude-sonnet-4-6',
            stop_reason: 'end_turn',
            stop_sequence: null,
            content: [{ type: 'text', text: 'ok', citations: null }],
            container: null,
            usage: {
                input_tokens: 1,
                output_tokens: 1,
            },
        });

        const provider = createVertexAnthropic({
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

    it('should tag errors with provider "vertex-anthropic"', async () => {
        messagesCreate.mockRejectedValue(new Error('upstream failure'));

        const provider = createVertexAnthropic({
            projectId: 'my-project',
            region: 'europe-west1',
        });

        const error = await provider
            .chatModel('claude-sonnet-4-6')
            .generate({ messages: [{ role: 'user', content: 'hello' }] })
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).provider).toBe('vertex-anthropic');
    });
});
