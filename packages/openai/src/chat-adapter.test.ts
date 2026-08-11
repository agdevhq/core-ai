import { describe, expect, it } from 'vitest';
import type {
    Response,
    ResponseStreamEvent,
} from 'openai/resources/responses/responses';
import {
    UnsupportedInputModalityError,
    ValidationError,
    type GenerateOptions,
    type Message,
    TEXT_ONLY_MODALITIES,
} from '@core-ai/core-ai';
import {
    convertMessages,
    createGenerateRequest,
    mapGenerateResponse,
    transformStream,
    validateOpenAIReasoningConfig,
} from './chat-adapter.js';
import { getOpenAIModelCapabilities } from './model-capabilities.js';
import { toAsyncIterable } from '@core-ai/testing';

const IMAGE_MESSAGES: Message[] = [
    {
        role: 'user',
        content: [
            {
                type: 'image',
                source: { type: 'url', url: 'https://example.com/photo.png' },
            },
        ],
    },
];

const AUDIO_MESSAGES: Message[] = [
    {
        role: 'user',
        content: [
            {
                type: 'audio',
                source: {
                    type: 'base64',
                    mediaType: 'audio/wav',
                    data: 'base64-audio',
                },
            },
        ],
    },
];

describe('convertMessages', () => {
    it('should convert system messages to developer role', () => {
        const messages: Message[] = [
            { role: 'system', content: 'You are helpful.' },
        ];

        expect(convertMessages(messages)).toEqual([
            { role: 'developer', content: 'You are helpful.' },
        ]);
    });

    it('should convert user text array to input_text parts', () => {
        const messages: Message[] = [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: 'Hello there',
                        metadata: { classification: 'public' },
                    },
                ],
            },
        ];

        expect(convertMessages(messages)).toEqual([
            {
                role: 'user',
                content: [{ type: 'input_text', text: 'Hello there' }],
            },
        ]);
    });

    it('should convert user image URL to input_image', () => {
        const messages: Message[] = [
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
        ];

        expect(convertMessages(messages)).toEqual([
            {
                role: 'user',
                content: [
                    {
                        type: 'input_image',
                        image_url: 'https://example.com/photo.png',
                    },
                ],
            },
        ]);
    });

    it('should convert user base64 image to data URI', () => {
        const messages: Message[] = [
            {
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            mediaType: 'image/png',
                            data: 'abc123',
                        },
                    },
                ],
            },
        ];

        expect(convertMessages(messages)).toEqual([
            {
                role: 'user',
                content: [
                    {
                        type: 'input_image',
                        image_url: 'data:image/png;base64,abc123',
                    },
                ],
            },
        ]);
    });

    it('should convert user file to input_file', () => {
        const messages: Message[] = [
            {
                role: 'user',
                content: [
                    {
                        type: 'file',
                        data: 'base64data',
                        mimeType: 'application/pdf',
                        filename: 'report.pdf',
                    },
                ],
            },
        ];

        expect(convertMessages(messages)).toEqual([
            {
                role: 'user',
                content: [
                    {
                        type: 'input_file',
                        file_data: 'base64data',
                        filename: 'report.pdf',
                    },
                ],
            },
        ]);
    });

    it('should reject audio instead of coercing it to input_file', () => {
        expect(() => convertMessages(AUDIO_MESSAGES)).toThrowError(
            /use provider\.chat\.chatModel\(\)/
        );
    });

    it('should wrap cross-provider reasoning in <thinking> tags', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'reasoning',
                        text: 'step-by-step thought',
                        providerMetadata: {
                            anthropic: { signature: 'sig_123' },
                        },
                    },
                    { type: 'text', text: 'answer' },
                ],
            },
        ];

        expect(convertMessages(messages)).toEqual([
            {
                role: 'assistant',
                content: '<thinking>step-by-step thought</thinking>\n\nanswer',
            },
        ]);
    });

    it('should treat OpenAI encrypted reasoning as foreign under azure-openai', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'reasoning',
                        text: 'azure must not replay openai ciphertext',
                        providerMetadata: {
                            openai: { encryptedContent: 'enc_openai' },
                        },
                    },
                    { type: 'text', text: 'answer' },
                ],
            },
        ];

        expect(
            convertMessages(messages, {
                providerMetadataKey: 'azure-openai',
            })
        ).toEqual([
            {
                role: 'assistant',
                content:
                    '<thinking>azure must not replay openai ciphertext</thinking>\n\nanswer',
            },
        ]);
    });

    it('should preserve azure-openai encrypted reasoning for same-provider round-trips', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'reasoning',
                        text: 'thinking...',
                        providerMetadata: {
                            'azure-openai': { encryptedContent: 'enc_azure' },
                        },
                    },
                    { type: 'text', text: 'answer' },
                ],
            },
        ];

        expect(
            convertMessages(messages, {
                providerMetadataKey: 'azure-openai',
            })
        ).toEqual([
            {
                type: 'reasoning',
                summary: [{ type: 'summary_text', text: 'thinking...' }],
                encrypted_content: 'enc_azure',
            },
            {
                role: 'assistant',
                content: 'answer',
            },
        ]);
    });

    it('should preserve reasoning encrypted content for stateless round-trips', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'reasoning',
                        text: 'thinking...',
                        metadata: { internal: true },
                        providerMetadata: {
                            openai: { encryptedContent: 'enc_123' },
                        },
                    },
                    {
                        type: 'text',
                        text: 'answer',
                        metadata: { annotation: 'safe' },
                    },
                    {
                        type: 'tool-call',
                        toolCall: {
                            id: 'tc_1',
                            name: 'search',
                            arguments: { query: 'weather' },
                            metadata: { transformed: true },
                        },
                    },
                ],
            },
            {
                role: 'tool',
                toolCallId: 'tc_1',
                content: 'Sunny, 72F',
                metadata: { validated: true },
            },
        ];

        expect(convertMessages(messages)).toEqual([
            {
                type: 'reasoning',
                summary: [{ type: 'summary_text', text: 'thinking...' }],
                encrypted_content: 'enc_123',
            },
            {
                role: 'assistant',
                content: 'answer',
            },
            {
                type: 'function_call',
                call_id: 'tc_1',
                name: 'search',
                arguments: '{"query":"weather"}',
            },
            {
                type: 'function_call_output',
                call_id: 'tc_1',
                output: 'Sunny, 72F',
            },
        ]);
    });
});

describe('createGenerateRequest', () => {
    it('should set store: false by default', () => {
        const request = createGenerateRequest('gpt-5-mini', {
            messages: [{ role: 'user', content: 'Hi' }],
        });

        expect(request.store).toBe(false);
    });

    it('should allow overriding store via providerOptions', () => {
        const request = createGenerateRequest('gpt-5-mini', {
            messages: [{ role: 'user', content: 'Hi' }],
            providerOptions: { openai: { store: true } },
        });

        expect(request.store).toBe(true);
    });

    it('should accept service tier scale via providerOptions', () => {
        const request = createGenerateRequest('gpt-5-mini', {
            messages: [{ role: 'user', content: 'Hi' }],
            providerOptions: { openai: { serviceTier: 'scale' } },
        });

        expect(request.service_tier).toBe('scale');
    });

    it('should reject invalid namespaced provider options', () => {
        const invalidProviderOptions = {
            openai: { store: 'yes' },
        } as unknown as GenerateOptions['providerOptions'];

        expect(() =>
            createGenerateRequest('gpt-5-mini', {
                messages: [{ role: 'user', content: 'Hi' }],
                providerOptions: invalidProviderOptions,
            })
        ).toThrowError(/expected boolean/);
    });

    it('should reject null namespaced provider options', () => {
        const invalidProviderOptions = {
            openai: null,
        } as unknown as GenerateOptions['providerOptions'];

        expect(() =>
            createGenerateRequest('gpt-5-mini', {
                messages: [{ role: 'user', content: 'Hi' }],
                providerOptions: invalidProviderOptions,
            })
        ).toThrowError(/expected object, received null/);
    });

    it('should include reasoning summary and encrypted reasoning include', () => {
        const request = createGenerateRequest('gpt-5-mini', {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'high' },
            providerOptions: {
                openai: {
                    include: ['foo.bar'],
                },
            },
        });

        expect(request.reasoning).toEqual({
            effort: 'high',
            summary: 'auto',
        });
        expect(request.include).toEqual(
            expect.arrayContaining(['foo.bar', 'reasoning.encrypted_content'])
        );
        expect(request.store).toBe(false);
    });

    it('should include encrypted reasoning even without providerOptions', () => {
        const request = createGenerateRequest('gpt-5-mini', {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'medium' },
        });

        expect(request.store).toBe(false);
        expect(request.include).toEqual(['reasoning.encrypted_content']);
    });

    it('should omit reasoning fields for models without reasoning support', () => {
        const request = createGenerateRequest('o1-mini', {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'medium' },
        });

        expect(request.reasoning).toBeUndefined();
        expect(request.include).toBeUndefined();
    });

    it('should convert encrypted reasoning to text for models without reasoning support', () => {
        const request = createGenerateRequest('gpt-4o', {
            messages: [
                {
                    role: 'assistant',
                    parts: [
                        {
                            type: 'reasoning',
                            text: 'thinking...',
                            providerMetadata: {
                                openai: { encryptedContent: 'enc_123' },
                            },
                        },
                        { type: 'text', text: 'answer' },
                    ],
                },
            ],
        });

        expect(request.input).toEqual([
            {
                role: 'assistant',
                content: '<thinking>thinking...</thinking>\n\nanswer',
            },
        ]);
    });

    it('should map and clamp reasoning effort for supported models', () => {
        const maxRequest = createGenerateRequest('gpt-5.2', {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'max' },
        });
        expect(maxRequest.reasoning).toEqual({
            effort: 'xhigh',
            summary: 'auto',
        });

        const clampedMinimal = createGenerateRequest('gpt-5.1', {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'minimal' },
        });
        expect(clampedMinimal.reasoning).toEqual({
            effort: 'low',
            summary: 'auto',
        });

        const clampedPro = createGenerateRequest('gpt-5-pro', {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'medium' },
        });
        expect(clampedPro.reasoning).toEqual({
            effort: 'high',
            summary: 'auto',
        });
    });

    it('should reject images for models without image input', () => {
        expect(() =>
            createGenerateRequest('gpt-3.5-turbo', {
                messages: IMAGE_MESSAGES,
            })
        ).toThrowError(ValidationError);
    });

    it('should accept images for models with image input', () => {
        expect(() =>
            createGenerateRequest('gpt-5-mini', { messages: IMAGE_MESSAGES })
        ).not.toThrow();
    });

    it('should attribute validation errors to the wrapping provider', () => {
        expect(() =>
            createGenerateRequest(
                'gpt-3.5-turbo',
                { messages: IMAGE_MESSAGES },
                { providerId: 'azure-openai' }
            )
        ).toThrowError(/^azure-openai model "gpt-3.5-turbo"/);
    });

    it('should honor capabilities supplied by a wrapping provider', () => {
        const textOnly = {
            ...getOpenAIModelCapabilities('gpt-4o'),
            modalities: TEXT_ONLY_MODALITIES,
        };

        expect(() =>
            createGenerateRequest(
                'gpt-4o',
                { messages: IMAGE_MESSAGES },
                { capabilities: textOnly }
            )
        ).toThrowError(ValidationError);
    });

    it('should reject audio with Chat Completions guidance', () => {
        try {
            createGenerateRequest('gpt-audio-1.5', {
                messages: AUDIO_MESSAGES,
            });
            expect.unreachable();
        } catch (error) {
            expect(error).toBeInstanceOf(UnsupportedInputModalityError);
            expect(error).toMatchObject({
                requestedModalities: ['audio'],
                supportedModalities: ['text'],
                unsupportedModalities: ['audio'],
            });
            expect(error).toHaveProperty(
                'message',
                expect.stringMatching(/use provider\.chat\.chatModel\(\)/)
            );
        }
    });
});

describe('mapGenerateResponse', () => {
    it('should map reasoning, text, tool calls, and usage', () => {
        const response = asResponse({
            output: [
                {
                    type: 'reasoning',
                    summary: [{ type: 'summary_text', text: 'short summary' }],
                    encrypted_content: 'enc_1',
                },
                {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'Final answer' }],
                },
                {
                    type: 'function_call',
                    call_id: 'tc_1',
                    name: 'search',
                    arguments: '{"query":"weather"}',
                },
            ],
            status: 'completed',
            usage: {
                input_tokens: 12,
                output_tokens: 7,
                input_tokens_details: { cached_tokens: 3 },
                output_tokens_details: { reasoning_tokens: 2 },
                total_tokens: 19,
            },
        });

        const result = mapGenerateResponse(response);

        expect(result.content).toBe('Final answer');
        expect(result.reasoning).toBe('short summary');
        expect(result.toolCalls).toEqual([
            {
                id: 'tc_1',
                name: 'search',
                arguments: { query: 'weather' },
            },
        ]);
        expect(result.parts).toEqual([
            {
                type: 'reasoning',
                text: 'short summary',
                providerMetadata: {
                    openai: { encryptedContent: 'enc_1' },
                },
            },
            { type: 'text', text: 'Final answer' },
            {
                type: 'tool-call',
                toolCall: {
                    id: 'tc_1',
                    name: 'search',
                    arguments: { query: 'weather' },
                },
            },
        ]);
        expect(result.usage).toEqual({
            inputTokens: 12,
            outputTokens: 7,
            inputTokenDetails: {
                cacheReadTokens: 3,
                cacheWriteTokens: 0,
            },
            outputTokenDetails: {
                reasoningTokens: 2,
            },
        });
    });

    it('should namespace encrypted reasoning under a wrapping provider id', () => {
        const response = asResponse({
            output: [
                {
                    type: 'reasoning',
                    summary: [{ type: 'summary_text', text: 'short summary' }],
                    encrypted_content: 'enc_azure',
                },
                {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'Final answer' }],
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

        expect(
            mapGenerateResponse(response, {
                providerMetadataKey: 'azure-openai',
            }).parts
        ).toEqual([
            {
                type: 'reasoning',
                text: 'short summary',
                providerMetadata: {
                    'azure-openai': { encryptedContent: 'enc_azure' },
                },
            },
            { type: 'text', text: 'Final answer' },
        ]);
    });

    it('should separate multiple reasoning summary parts', () => {
        const response = asResponse({
            output: [
                {
                    type: 'reasoning',
                    summary: [
                        { type: 'summary_text', text: 'first summary' },
                        { type: 'summary_text', text: 'second summary' },
                    ],
                    encrypted_content: 'enc_1',
                },
            ],
            status: 'completed',
        });

        const result = mapGenerateResponse(response);

        expect(result.reasoning).toBe('first summary\n\nsecond summary');
        expect(result.parts).toEqual([
            {
                type: 'reasoning',
                text: 'first summary\n\nsecond summary',
                providerMetadata: {
                    openai: { encryptedContent: 'enc_1' },
                },
            },
        ]);
    });

    it('should separate multiple reasoning output items', () => {
        const response = asResponse({
            output: [
                {
                    type: 'reasoning',
                    summary: [{ type: 'summary_text', text: 'first item' }],
                },
                {
                    type: 'reasoning',
                    summary: [{ type: 'summary_text', text: 'second item' }],
                },
            ],
            status: 'completed',
        });

        expect(mapGenerateResponse(response).reasoning).toBe(
            'first item\n\nsecond item'
        );
    });

    it('should return finishReason length when max_output_tokens', () => {
        const response = asResponse({
            output: [
                {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'truncated' }],
                },
            ],
            status: 'incomplete',
            incomplete_details: { reason: 'max_output_tokens' },
        });

        expect(mapGenerateResponse(response).finishReason).toBe('length');
    });

    it('should return finishReason content-filter', () => {
        const response = asResponse({
            output: [
                {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: '' }],
                },
            ],
            status: 'incomplete',
            incomplete_details: { reason: 'content_filter' },
        });

        expect(mapGenerateResponse(response).finishReason).toBe(
            'content-filter'
        );
    });

    it('should return finishReason unknown for non-completed status', () => {
        const response = asResponse({
            output: [],
            status: 'failed',
        });

        expect(mapGenerateResponse(response).finishReason).toBe('unknown');
    });

    it('should return finishReason tool-calls when tool calls present', () => {
        const response = asResponse({
            output: [
                {
                    type: 'function_call',
                    call_id: 'tc_1',
                    name: 'search',
                    arguments: '{"q":"test"}',
                },
            ],
            status: 'completed',
        });

        expect(mapGenerateResponse(response).finishReason).toBe('tool-calls');
    });

    it('should omit encryptedContent metadata when not provided', () => {
        const response = asResponse({
            output: [
                {
                    type: 'reasoning',
                    summary: [
                        { type: 'summary_text', text: 'stored mode summary' },
                    ],
                },
            ],
            status: 'completed',
        });

        const result = mapGenerateResponse(response);
        const reasoningPart = result.parts[0];

        expect(reasoningPart).toEqual({
            type: 'reasoning',
            text: 'stored mode summary',
            providerMetadata: { openai: {} },
        });
    });
});

describe('transformStream', () => {
    it('should map reasoning, tool call, text, and finish events', async () => {
        const stream = toAsyncIterable<ResponseStreamEvent>([
            asStreamEvent({
                type: 'response.reasoning_summary_text.delta',
                item_id: 'rs_1',
                summary_index: 0,
                delta: 'think',
            }),
            asStreamEvent({
                type: 'response.reasoning_summary_text.done',
                item_id: 'rs_1',
                summary_index: 0,
                text: 'think',
            }),
            asStreamEvent({
                type: 'response.output_item.done',
                output_index: 0,
                item: {
                    type: 'reasoning',
                    id: 'rs_1',
                    summary: [{ type: 'summary_text', text: 'think' }],
                    encrypted_content: 'enc_1',
                },
            }),
            asStreamEvent({
                type: 'response.output_item.added',
                output_index: 1,
                item: {
                    type: 'function_call',
                    call_id: 'tc_1',
                    name: 'search',
                    arguments: '',
                },
            }),
            asStreamEvent({
                type: 'response.function_call_arguments.delta',
                output_index: 1,
                item_id: 'item_1',
                delta: '{"query":"wea',
            }),
            asStreamEvent({
                type: 'response.function_call_arguments.delta',
                output_index: 1,
                item_id: 'item_1',
                delta: 'ther"}',
            }),
            asStreamEvent({
                type: 'response.output_item.done',
                output_index: 1,
                item: {
                    type: 'function_call',
                    call_id: 'tc_1',
                    name: 'search',
                    arguments: '{"query":"weather"}',
                },
            }),
            asStreamEvent({
                type: 'response.output_text.delta',
                delta: 'answer',
            }),
            asStreamEvent({
                type: 'response.completed',
                response: asResponse({
                    output: [],
                    status: 'completed',
                    usage: {
                        input_tokens: 4,
                        output_tokens: 2,
                        input_tokens_details: { cached_tokens: 0 },
                        output_tokens_details: { reasoning_tokens: 1 },
                        total_tokens: 6,
                    },
                }),
            }),
        ]);

        const events = [];
        for await (const event of transformStream(stream)) {
            events.push(event);
        }

        expect(events).toEqual([
            { type: 'reasoning-start' },
            { type: 'reasoning-delta', text: 'think' },
            {
                type: 'reasoning-end',
                providerMetadata: {
                    openai: { encryptedContent: 'enc_1' },
                },
            },
            { type: 'tool-call-start', toolCallId: 'tc_1', toolName: 'search' },
            {
                type: 'tool-call-delta',
                toolCallId: 'tc_1',
                argumentsDelta: '{"query":"wea',
            },
            {
                type: 'tool-call-delta',
                toolCallId: 'tc_1',
                argumentsDelta: 'ther"}',
            },
            {
                type: 'tool-call-end',
                toolCall: {
                    id: 'tc_1',
                    name: 'search',
                    arguments: { query: 'weather' },
                },
            },
            { type: 'text-start' },
            { type: 'text-delta', text: 'answer' },
            { type: 'text-end' },
            {
                type: 'finish',
                finishReason: 'tool-calls',
                usage: {
                    inputTokens: 4,
                    outputTokens: 2,
                    inputTokenDetails: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                    },
                    outputTokenDetails: {
                        reasoningTokens: 1,
                    },
                },
            },
        ]);
    });

    it('should emit a single reasoning lifecycle across multiple summary parts', async () => {
        const stream = toAsyncIterable<ResponseStreamEvent>([
            asStreamEvent({
                type: 'response.reasoning_summary_text.delta',
                item_id: 'rs_2',
                summary_index: 0,
                delta: 'first',
            }),
            asStreamEvent({
                type: 'response.reasoning_summary_text.done',
                item_id: 'rs_2',
                summary_index: 0,
                text: 'first',
            }),
            asStreamEvent({
                type: 'response.reasoning_summary_text.delta',
                item_id: 'rs_2',
                summary_index: 1,
                delta: 'second',
            }),
            asStreamEvent({
                type: 'response.reasoning_summary_text.done',
                item_id: 'rs_2',
                summary_index: 1,
                text: 'second',
            }),
            asStreamEvent({
                type: 'response.output_item.done',
                output_index: 0,
                item: {
                    type: 'reasoning',
                    id: 'rs_2',
                    summary: [
                        { type: 'summary_text', text: 'first' },
                        { type: 'summary_text', text: 'second' },
                    ],
                    encrypted_content: 'enc_2',
                },
            }),
            asStreamEvent({
                type: 'response.completed',
                response: asResponse({
                    output: [],
                    status: 'completed',
                }),
            }),
        ]);

        const events = [];
        for await (const event of transformStream(stream)) {
            events.push(event);
        }

        expect(events).toEqual([
            { type: 'reasoning-start' },
            { type: 'reasoning-delta', text: 'first' },
            { type: 'reasoning-delta', text: '\n\n' },
            { type: 'reasoning-delta', text: 'second' },
            {
                type: 'reasoning-end',
                providerMetadata: {
                    openai: { encryptedContent: 'enc_2' },
                },
            },
            {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                    inputTokens: 0,
                    outputTokens: 0,
                    inputTokenDetails: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                    },
                    outputTokenDetails: {},
                },
            },
        ]);
    });

    it('should return finishReason tool-calls for done-only tool-call ordering', async () => {
        const stream = toAsyncIterable<ResponseStreamEvent>([
            asStreamEvent({
                type: 'response.output_item.done',
                output_index: 0,
                item: {
                    type: 'function_call',
                    call_id: 'tc_done_only',
                    name: 'search',
                    arguments: '{"query":"weather"}',
                },
            }),
            asStreamEvent({
                type: 'response.completed',
                response: asResponse({
                    output: [],
                    status: 'completed',
                }),
            }),
        ]);

        const events = [];
        for await (const event of transformStream(stream)) {
            events.push(event);
        }

        expect(events).toEqual([
            {
                type: 'tool-call-end',
                toolCall: {
                    id: 'tc_done_only',
                    name: 'search',
                    arguments: { query: 'weather' },
                },
            },
            {
                type: 'finish',
                finishReason: 'tool-calls',
                usage: {
                    inputTokens: 0,
                    outputTokens: 0,
                    inputTokenDetails: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                    },
                    outputTokenDetails: {},
                },
            },
        ]);
    });

    it('should return finishReason stop for text-only stream', async () => {
        const stream = toAsyncIterable<ResponseStreamEvent>([
            asStreamEvent({
                type: 'response.output_text.delta',
                delta: 'hello',
            }),
            asStreamEvent({
                type: 'response.completed',
                response: asResponse({
                    output: [],
                    status: 'completed',
                }),
            }),
        ]);

        const events = [];
        for await (const event of transformStream(stream)) {
            events.push(event);
        }

        const finish = events.find((e) => e.type === 'finish');
        expect(finish).toMatchObject({ finishReason: 'stop' });
    });

    it('should emit reasoning-delta from .done text when no deltas were received', async () => {
        const stream = toAsyncIterable<ResponseStreamEvent>([
            asStreamEvent({
                type: 'response.reasoning_summary_text.done',
                item_id: 'rs_1',
                summary_index: 0,
                text: 'fallback summary',
            }),
            asStreamEvent({
                type: 'response.output_item.done',
                output_index: 0,
                item: {
                    type: 'reasoning',
                    id: 'rs_1',
                    summary: [
                        { type: 'summary_text', text: 'fallback summary' },
                    ],
                    encrypted_content: 'enc_1',
                },
            }),
            asStreamEvent({
                type: 'response.completed',
                response: asResponse({
                    output: [],
                    status: 'completed',
                }),
            }),
        ]);

        const events = [];
        for await (const event of transformStream(stream)) {
            events.push(event);
        }

        expect(events).toEqual([
            { type: 'reasoning-start' },
            { type: 'reasoning-delta', text: 'fallback summary' },
            {
                type: 'reasoning-end',
                providerMetadata: {
                    openai: { encryptedContent: 'enc_1' },
                },
            },
            {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                    inputTokens: 0,
                    outputTokens: 0,
                    inputTokenDetails: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                    },
                    outputTokenDetails: {},
                },
            },
        ]);
    });

    it('should not duplicate reasoning when only some summary parts have deltas', async () => {
        const stream = toAsyncIterable<ResponseStreamEvent>([
            asStreamEvent({
                type: 'response.reasoning_summary_text.delta',
                item_id: 'rs_1',
                summary_index: 0,
                delta: 'alpha',
            }),
            asStreamEvent({
                type: 'response.reasoning_summary_text.done',
                item_id: 'rs_1',
                summary_index: 0,
                text: 'alpha',
            }),
            asStreamEvent({
                type: 'response.reasoning_summary_text.done',
                item_id: 'rs_1',
                summary_index: 1,
                text: 'beta',
            }),
            asStreamEvent({
                type: 'response.output_item.done',
                output_index: 0,
                item: {
                    type: 'reasoning',
                    id: 'rs_1',
                    summary: [
                        { type: 'summary_text', text: 'alpha' },
                        { type: 'summary_text', text: 'beta' },
                    ],
                    encrypted_content: 'enc_1',
                },
            }),
            asStreamEvent({
                type: 'response.completed',
                response: asResponse({
                    output: [],
                    status: 'completed',
                }),
            }),
        ]);

        const events = [];
        for await (const event of transformStream(stream)) {
            events.push(event);
        }

        expect(events).toEqual([
            { type: 'reasoning-start' },
            { type: 'reasoning-delta', text: 'alpha' },
            { type: 'reasoning-delta', text: '\n\n' },
            { type: 'reasoning-delta', text: 'beta' },
            {
                type: 'reasoning-end',
                providerMetadata: {
                    openai: { encryptedContent: 'enc_1' },
                },
            },
            {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                    inputTokens: 0,
                    outputTokens: 0,
                    inputTokenDetails: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                    },
                    outputTokenDetails: {},
                },
            },
        ]);

        const reasoningDeltas = events.filter(
            (event) => event.type === 'reasoning-delta'
        );
        expect(reasoningDeltas).toHaveLength(3);
    });

    it('should backfill reasoning from output_item.done summary when no deltas or .done text were seen', async () => {
        const stream = toAsyncIterable<ResponseStreamEvent>([
            asStreamEvent({
                type: 'response.output_item.done',
                output_index: 0,
                item: {
                    type: 'reasoning',
                    id: 'rs_1',
                    summary: [
                        { type: 'summary_text', text: 'part one' },
                        { type: 'summary_text', text: 'part two' },
                    ],
                    encrypted_content: 'enc_1',
                },
            }),
            asStreamEvent({
                type: 'response.completed',
                response: asResponse({
                    output: [],
                    status: 'completed',
                }),
            }),
        ]);

        const events = [];
        for await (const event of transformStream(stream)) {
            events.push(event);
        }

        expect(events).toEqual([
            { type: 'reasoning-start' },
            { type: 'reasoning-delta', text: 'part one\n\npart two' },
            {
                type: 'reasoning-end',
                providerMetadata: {
                    openai: { encryptedContent: 'enc_1' },
                },
            },
            {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                    inputTokens: 0,
                    outputTokens: 0,
                    inputTokenDetails: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                    },
                    outputTokenDetails: {},
                },
            },
        ]);
    });

    it('should not duplicate reasoning for multi-part .done-only fallback', async () => {
        const stream = toAsyncIterable<ResponseStreamEvent>([
            asStreamEvent({
                type: 'response.reasoning_summary_text.done',
                item_id: 'rs_1',
                summary_index: 0,
                text: 'one',
            }),
            asStreamEvent({
                type: 'response.reasoning_summary_text.done',
                item_id: 'rs_1',
                summary_index: 1,
                text: 'two',
            }),
            asStreamEvent({
                type: 'response.output_item.done',
                output_index: 0,
                item: {
                    type: 'reasoning',
                    id: 'rs_1',
                    summary: [
                        { type: 'summary_text', text: 'one' },
                        { type: 'summary_text', text: 'two' },
                    ],
                    encrypted_content: 'enc_1',
                },
            }),
            asStreamEvent({
                type: 'response.completed',
                response: asResponse({
                    output: [],
                    status: 'completed',
                }),
            }),
        ]);

        const events = [];
        for await (const event of transformStream(stream)) {
            events.push(event);
        }

        expect(events).toEqual([
            { type: 'reasoning-start' },
            { type: 'reasoning-delta', text: 'one' },
            { type: 'reasoning-delta', text: '\n\n' },
            { type: 'reasoning-delta', text: 'two' },
            {
                type: 'reasoning-end',
                providerMetadata: {
                    openai: { encryptedContent: 'enc_1' },
                },
            },
            {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                    inputTokens: 0,
                    outputTokens: 0,
                    inputTokenDetails: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                    },
                    outputTokenDetails: {},
                },
            },
        ]);

        const reasoningDeltas = events.filter(
            (event) => event.type === 'reasoning-delta'
        );
        expect(reasoningDeltas).toHaveLength(3);
    });

    it('should return finishReason length when stream is incomplete', async () => {
        const stream = toAsyncIterable<ResponseStreamEvent>([
            asStreamEvent({
                type: 'response.output_text.delta',
                delta: 'partial',
            }),
            asStreamEvent({
                type: 'response.completed',
                response: asResponse({
                    output: [],
                    status: 'incomplete',
                    incomplete_details: { reason: 'max_output_tokens' },
                }),
            }),
        ]);

        const events = [];
        for await (const event of transformStream(stream)) {
            events.push(event);
        }

        const finish = events.find((e) => e.type === 'finish');
        expect(finish).toMatchObject({ finishReason: 'length' });
    });
});

describe('validateOpenAIReasoningConfig', () => {
    it('should reject temperature/topP for restricted models', () => {
        expect(() =>
            validateOpenAIReasoningConfig('gpt-5.2', {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'medium' },
                temperature: 0.2,
            })
        ).toThrowError(ValidationError);

        expect(() =>
            validateOpenAIReasoningConfig('gpt-5.1', {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'medium' },
                topP: 0.9,
            })
        ).toThrowError(ValidationError);
    });
});

function asResponse(value: unknown): Response {
    return value as Response;
}

function asStreamEvent(value: unknown): ResponseStreamEvent {
    return value as ResponseStreamEvent;
}
