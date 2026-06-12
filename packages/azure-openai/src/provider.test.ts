import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '@core-ai/core-ai';
import type { OpenAIChatClient } from '@core-ai/openai/compat';
import { createAzureOpenAI } from './provider.js';

const { azureConstructor, chatCreate, openAIConstructor } = vi.hoisted(() => ({
    azureConstructor: vi.fn(),
    chatCreate: vi.fn(),
    openAIConstructor: vi.fn(),
}));

vi.mock('openai', async (importActual) => {
    const actual = await importActual<typeof import('openai')>();
    return {
        ...actual,
        default: class {
            chat = {
                completions: {
                    create: chatCreate,
                },
            };

            constructor(options: unknown) {
                openAIConstructor(options);
            }
        },
        AzureOpenAI: class {
            chat = {
                completions: {
                    create: chatCreate,
                },
            };

            constructor(options: unknown) {
                azureConstructor(options);
            }
        },
    };
});

describe('createAzureOpenAI', () => {
    beforeEach(() => {
        azureConstructor.mockReset();
        chatCreate.mockReset();
        openAIConstructor.mockReset();
    });

    it('should create an OpenAI v1 client by default', () => {
        createAzureOpenAI({
            apiKey: 'test-key',
            endpoint: 'https://example.openai.azure.com',
        });

        expect(openAIConstructor).toHaveBeenCalledWith({
            apiKey: 'test-key',
            baseURL: 'https://example.openai.azure.com/openai/v1',
        });
        expect(azureConstructor).not.toHaveBeenCalled();
    });

    it('should accept a full Azure OpenAI v1 base URL', () => {
        createAzureOpenAI({
            apiKey: 'test-key',
            endpoint: 'https://example.openai.azure.com/openai/v1/',
        });

        expect(openAIConstructor).toHaveBeenCalledWith({
            apiKey: 'test-key',
            baseURL: 'https://example.openai.azure.com/openai/v1',
        });
    });

    it('should create a classic Azure OpenAI client when requested', () => {
        const azureADTokenProvider = async () => 'token';

        createAzureOpenAI({
            api: 'classic',
            apiKey: 'test-key',
            endpoint: 'https://example.openai.azure.com',
            apiVersion: '2025-04-01-preview',
            deployment: 'chat-deployment',
            azureADTokenProvider,
        });

        expect(azureConstructor).toHaveBeenCalledWith({
            apiKey: 'test-key',
            endpoint: 'https://example.openai.azure.com',
            apiVersion: '2025-04-01-preview',
            deployment: 'chat-deployment',
            azureADTokenProvider,
        });
        expect(openAIConstructor).not.toHaveBeenCalled();
    });

    it('should create a chat model with provider azure-openai', () => {
        const provider = createAzureOpenAI({ apiKey: 'test-key' });

        const chatModel = provider.chatModel('chat-deployment');

        expect(chatModel.provider).toBe('azure-openai');
        expect(chatModel.modelId).toBe('chat-deployment');
    });

    it('should call the underlying Azure OpenAI client', async () => {
        chatCreate.mockResolvedValue({
            id: 'chatcmpl-1',
            object: 'chat.completion',
            created: Date.now(),
            model: 'chat-deployment',
            choices: [
                {
                    index: 0,
                    finish_reason: 'stop',
                    logprobs: null,
                    message: {
                        role: 'assistant',
                        content: 'ok',
                        refusal: null,
                    },
                },
            ],
            usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
            },
        });

        const provider = createAzureOpenAI({ apiKey: 'test-key' });

        await provider
            .chatModel('chat-deployment')
            .generate({ messages: [{ role: 'user', content: 'hello' }] });

        expect(chatCreate).toHaveBeenCalledTimes(1);
        const [request] = chatCreate.mock.calls[0] ?? [];
        expect(request).toMatchObject({ model: 'chat-deployment' });
    });

    it('should use a provided client', async () => {
        chatCreate.mockResolvedValue({
            id: 'chatcmpl-1',
            object: 'chat.completion',
            created: Date.now(),
            model: 'chat-deployment',
            choices: [
                {
                    index: 0,
                    finish_reason: 'stop',
                    logprobs: null,
                    message: {
                        role: 'assistant',
                        content: 'ok',
                        refusal: null,
                    },
                },
            ],
            usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
            },
        });

        const client = {
            chat: {
                completions: {
                    create: chatCreate,
                },
            },
        } as unknown as OpenAIChatClient;

        await createAzureOpenAI({ client })
            .chatModel('chat-deployment')
            .generate({ messages: [{ role: 'user', content: 'hello' }] });

        expect(azureConstructor).not.toHaveBeenCalled();
        expect(openAIConstructor).not.toHaveBeenCalled();
        expect(chatCreate).toHaveBeenCalledTimes(1);
    });

    it('should tag errors with provider "azure-openai"', async () => {
        chatCreate.mockRejectedValue(new Error('upstream failure'));

        const provider = createAzureOpenAI({ apiKey: 'test-key' });

        const error = await provider
            .chatModel('chat-deployment')
            .generate({ messages: [{ role: 'user', content: 'hello' }] })
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).provider).toBe('azure-openai');
    });
});
