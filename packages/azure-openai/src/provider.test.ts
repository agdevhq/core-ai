import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ProviderError, ValidationError } from '@core-ai/core-ai';
import type OpenAI from 'openai';
import { createAzureOpenAI } from './provider.js';

const { azureConstructor, chatCreate, openAIConstructor, responsesCreate } =
    vi.hoisted(() => ({
        azureConstructor: vi.fn(),
        chatCreate: vi.fn(),
        openAIConstructor: vi.fn(),
        responsesCreate: vi.fn(),
    }));

vi.mock('openai', async (importActual) => {
    const actual = await importActual<typeof import('openai')>();
    return {
        ...actual,
        default: class {
            responses = {
                create: responsesCreate,
            };
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
            responses = {
                create: responsesCreate,
            };
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
        responsesCreate.mockReset();
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
        expect(chatModel.capabilities.tools.strictSchemas).toEqual({
            supported: true,
        });
    });

    it('should forward strict tools on the v1 Responses API', async () => {
        responsesCreate.mockResolvedValue(createResponsesResult());
        const model = createAzureOpenAI({
            apiKey: 'test-key',
        }).chatModel('opaque-deployment');

        await model.generate({
            messages: [{ role: 'user', content: 'hello' }],
            tools: createStrictTools(),
        });

        expect(responsesCreate.mock.calls[0]?.[0]).toMatchObject({
            tools: [
                expect.objectContaining({
                    strict: true,
                    name: 'search',
                }),
            ],
        });
    });

    it('should forward classic strict tools inside the function payload', async () => {
        chatCreate.mockResolvedValue(createChatCompletionResult());
        const model = createAzureOpenAI({
            api: 'classic',
            apiVersion: '2024-08-01-preview',
        }).chatModel('opaque-deployment');

        await model.generate({
            messages: [{ role: 'user', content: 'hello' }],
            tools: createStrictTools(),
        });

        expect(chatCreate.mock.calls[0]?.[0]).toMatchObject({
            tools: [
                {
                    type: 'function',
                    function: expect.objectContaining({
                        strict: true,
                        name: 'search',
                    }),
                },
            ],
        });
    });

    it('should keep classic root chat models on Chat Completions', async () => {
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
        const provider = createAzureOpenAI({
            api: 'classic',
            apiVersion: '2025-04-01-preview',
        });

        await provider
            .chatModel('chat-deployment')
            .generate({ messages: [{ role: 'user', content: 'hello' }] });

        expect(chatCreate).toHaveBeenCalledTimes(1);
        expect(responsesCreate).not.toHaveBeenCalled();
    });

    it('should use Responses API for v1 root chat models', async () => {
        responsesCreate.mockResolvedValue({
            output: [
                {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'ok' }],
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
        });

        const provider = createAzureOpenAI({ apiKey: 'test-key' });

        await provider
            .chatModel('chat-deployment')
            .generate({ messages: [{ role: 'user', content: 'hello' }] });

        expect(responsesCreate).toHaveBeenCalledTimes(1);
        expect(chatCreate).not.toHaveBeenCalled();
        const [request] = responsesCreate.mock.calls[0] ?? [];
        expect(request).toMatchObject({ model: 'chat-deployment' });
    });

    it('should namespace encrypted reasoning under azure-openai', async () => {
        responsesCreate.mockResolvedValue({
            output: [
                {
                    type: 'reasoning',
                    id: 'rs_1',
                    summary: [{ type: 'summary_text', text: 'plan' }],
                    encrypted_content: 'enc_azure',
                },
                {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'ok' }],
                },
            ],
            status: 'completed',
            usage: {
                input_tokens: 1,
                output_tokens: 1,
                input_tokens_details: { cached_tokens: 0 },
                output_tokens_details: { reasoning_tokens: 1 },
                total_tokens: 2,
            },
        });

        const provider = createAzureOpenAI({ apiKey: 'test-key' });
        const result = await provider.chatModel('gpt-5.4').generate({
            messages: [{ role: 'user', content: 'hello' }],
            reasoning: { effort: 'medium' },
        });

        expect(result.parts).toEqual([
            {
                type: 'reasoning',
                text: 'plan',
                providerMetadata: {
                    'azure-openai': { encryptedContent: 'enc_azure' },
                },
            },
            { type: 'text', text: 'ok' },
        ]);
    });

    it('should downgrade OpenAI encrypted reasoning when calling Azure', async () => {
        responsesCreate.mockResolvedValue({
            output: [
                {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'ok' }],
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
        });

        const provider = createAzureOpenAI({ apiKey: 'test-key' });
        await provider.chatModel('gpt-5.4').generate({
            messages: [
                {
                    role: 'assistant',
                    parts: [
                        {
                            type: 'reasoning',
                            text: 'prior openai thought',
                            providerMetadata: {
                                openai: { encryptedContent: 'enc_openai' },
                            },
                        },
                        { type: 'text', text: 'prior answer' },
                    ],
                },
                { role: 'user', content: 'continue' },
            ],
            reasoning: { effort: 'medium' },
        });

        const [request] = responsesCreate.mock.calls[0] ?? [];
        expect(request).toMatchObject({
            input: [
                {
                    role: 'assistant',
                    content:
                        '<thinking>prior openai thought</thinking>\n\nprior answer',
                },
                { role: 'user', content: 'continue' },
            ],
        });
        expect(JSON.stringify(request.input)).not.toContain('enc_openai');
    });

    it('should round-trip azure-openai encrypted reasoning on continuation', async () => {
        responsesCreate.mockResolvedValue({
            output: [
                {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'ok' }],
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
        });

        const provider = createAzureOpenAI({ apiKey: 'test-key' });
        await provider.chatModel('gpt-5.4').generate({
            messages: [
                {
                    role: 'assistant',
                    parts: [
                        {
                            type: 'reasoning',
                            text: 'prior azure thought',
                            providerMetadata: {
                                'azure-openai': {
                                    encryptedContent: 'enc_azure',
                                },
                            },
                        },
                        { type: 'text', text: 'prior answer' },
                    ],
                },
                { role: 'user', content: 'continue' },
            ],
            reasoning: { effort: 'medium' },
        });

        const [request] = responsesCreate.mock.calls[0] ?? [];
        expect(request).toMatchObject({
            input: [
                {
                    type: 'reasoning',
                    summary: [
                        { type: 'summary_text', text: 'prior azure thought' },
                    ],
                    encrypted_content: 'enc_azure',
                },
                {
                    role: 'assistant',
                    content: 'prior answer',
                },
                { role: 'user', content: 'continue' },
            ],
        });
    });

    it('should expose strict Chat Completions under chat', async () => {
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

        await provider.chat
            .chatModel('chat-deployment')
            .generate({ messages: [{ role: 'user', content: 'hello' }] });

        expect(chatCreate).toHaveBeenCalledTimes(1);
        expect(responsesCreate).not.toHaveBeenCalled();
    });

    it('should use a provided client', async () => {
        responsesCreate.mockResolvedValue({
            output: [
                {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'ok' }],
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
        });

        const client = {
            responses: {
                create: responsesCreate,
            },
        } as unknown as OpenAI;

        await createAzureOpenAI({ client })
            .chatModel('chat-deployment')
            .generate({ messages: [{ role: 'user', content: 'hello' }] });

        expect(azureConstructor).not.toHaveBeenCalled();
        expect(openAIConstructor).not.toHaveBeenCalled();
        expect(responsesCreate).toHaveBeenCalledTimes(1);
    });

    it('should tag errors with provider "azure-openai"', async () => {
        responsesCreate.mockRejectedValue(new Error('upstream failure'));

        const provider = createAzureOpenAI({ apiKey: 'test-key' });

        const error = await provider
            .chatModel('chat-deployment')
            .generate({ messages: [{ role: 'user', content: 'hello' }] })
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).provider).toBe('azure-openai');
    });

    it('should tag Responses API validation errors with provider "azure-openai"', async () => {
        const provider = createAzureOpenAI({ apiKey: 'test-key' });

        const error = await provider
            .chatModel('gpt-3.5-turbo')
            .generate({
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image',
                                source: {
                                    type: 'url',
                                    url: 'https://example.com/photo.png',
                                },
                            },
                        ],
                    },
                ],
            })
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).provider).toBe('azure-openai');
        expect(responsesCreate).not.toHaveBeenCalled();
    });
});

function createStrictTools() {
    return {
        search: {
            name: 'search',
            description: 'Search',
            parameters: z.object({ query: z.string() }),
            strict: true,
        },
    };
}

function createResponsesResult() {
    return {
        output: [
            {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'ok' }],
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

function createChatCompletionResult() {
    return {
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: Date.now(),
        model: 'opaque-deployment',
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
    };
}
