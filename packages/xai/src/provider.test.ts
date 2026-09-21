import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
    ProviderError,
    resultToMessage,
    type GenerateOptions,
    type Message,
} from '@core-ai/core-ai';

import { createXAI } from './provider.ts';

const { chatCreate, responsesCreate } = vi.hoisted(() => ({
    chatCreate: vi.fn(),
    responsesCreate: vi.fn(),
}));

vi.mock('openai', async (importActual) => {
    const actual = await importActual<typeof import('openai')>();
    return {
        ...actual,
        default: class {
            chat = { completions: { create: chatCreate } };
            responses = { create: responsesCreate };
        },
    };
});

const MESSAGES: Message[] = [{ role: 'user', content: 'hello' }];

function createResponse(output: unknown[] = [createOutputMessage('ok')]) {
    return {
        output,
        status: 'completed',
        usage: {
            input_tokens: 10,
            output_tokens: 48,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 47 },
            total_tokens: 58,
        },
    };
}

function createOutputMessage(text: string) {
    return {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text }],
    };
}

function createChatCompletion() {
    return {
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: 0,
        model: 'grok-4.7',
        choices: [
            {
                index: 0,
                finish_reason: 'stop',
                logprobs: null,
                message: { role: 'assistant', content: 'ok', refusal: null },
            },
        ],
        usage: {
            prompt_tokens: 10,
            completion_tokens: 1,
            total_tokens: 69,
            completion_tokens_details: { reasoning_tokens: 58 },
        },
    };
}

function lastRequest(create: typeof chatCreate): Record<string, unknown> {
    return create.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

describe('createXAI', () => {
    beforeEach(() => {
        chatCreate.mockReset();
        responsesCreate.mockReset();
        chatCreate.mockResolvedValue(createChatCompletion());
        responsesCreate.mockResolvedValue(createResponse());
    });

    it('should throw when neither apiKey nor client is provided', () => {
        expect(() => createXAI()).toThrow('createXAI: apiKey is required.');
        expect(() => createXAI({})).toThrow('createXAI: apiKey is required.');
    });

    it('should create chat models with provider xai on both APIs', () => {
        const provider = createXAI({ apiKey: 'test-key' });

        expect(provider.chatModel('grok-4.7').provider).toBe('xai');
        expect(provider.chat.chatModel('grok-4.7').provider).toBe('xai');
    });

    describe('Responses API (default)', () => {
        it('should send stateless requests that ask for encrypted reasoning', async () => {
            const provider = createXAI({ apiKey: 'test-key' });

            await provider.chatModel('grok-4.7').generate({
                messages: MESSAGES,
            });

            expect(chatCreate).not.toHaveBeenCalled();
            expect(lastRequest(responsesCreate)).toMatchObject({
                model: 'grok-4.7',
                store: false,
                include: ['reasoning.encrypted_content'],
            });
        });

        it('should report output tokens as returned, since they include reasoning', async () => {
            const provider = createXAI({ apiKey: 'test-key' });

            const result = await provider
                .chatModel('grok-4.7')
                .generate({ messages: MESSAGES });

            expect(result.usage.outputTokens).toBe(48);
            expect(result.usage.outputTokenDetails.reasoningTokens).toBe(47);
        });

        it.each([
            ['max', 'xhigh'],
            ['minimal', 'low'],
        ] as const)(
            'should send effort %s as %s',
            async (effort, expectedEffort) => {
                const provider = createXAI({ apiKey: 'test-key' });

                await provider.chatModel('grok-4.7').generate({
                    messages: MESSAGES,
                    reasoning: { effort },
                });

                expect(lastRequest(responsesCreate).reasoning).toMatchObject({
                    effort: expectedEffort,
                });
            }
        );

        it('should not send an effort to models that reject it', async () => {
            const provider = createXAI({ apiKey: 'test-key' });

            await provider.chatModel('grok-4.20-0309-reasoning').generate({
                messages: MESSAGES,
                reasoning: { effort: 'high' },
            });

            expect(lastRequest(responsesCreate).reasoning).toBeUndefined();
        });

        it('should read provider options from providerOptions.xai', async () => {
            const provider = createXAI({ apiKey: 'test-key' });

            await provider.chatModel('grok-4.7').generate({
                messages: MESSAGES,
                providerOptions: { xai: { promptCacheKey: 'conversation-1' } },
            });

            expect(lastRequest(responsesCreate)).toMatchObject({
                prompt_cache_key: 'conversation-1',
            });
        });

        it('should use strict json_schema structured output', async () => {
            responsesCreate.mockResolvedValue(
                createResponse([createOutputMessage('{"city":"Berlin"}')])
            );
            const provider = createXAI({ apiKey: 'test-key' });

            const result = await provider.chatModel('grok-4.7').generateObject({
                messages: MESSAGES,
                schema: z.object({ city: z.string() }),
            });

            expect(result.object).toEqual({ city: 'Berlin' });
            expect(lastRequest(responsesCreate).text).toMatchObject({
                format: { type: 'json_schema', strict: true },
            });
        });

        it('should round-trip encrypted reasoning under the xai namespace only', async () => {
            responsesCreate.mockResolvedValueOnce(
                createResponse([
                    {
                        type: 'reasoning',
                        id: 'rs_1',
                        summary: [{ type: 'summary_text', text: 'thinking' }],
                        encrypted_content: 'xai-encrypted',
                    },
                    createOutputMessage('first answer'),
                ])
            );
            const model = createXAI({ apiKey: 'test-key' }).chatModel(
                'grok-4.7'
            );

            const first = await model.generate({ messages: MESSAGES });
            const foreignAssistantMessage: Message = {
                role: 'assistant',
                parts: [
                    {
                        type: 'reasoning',
                        text: 'foreign thinking',
                        providerMetadata: {
                            openai: { encryptedContent: 'openai-encrypted' },
                        },
                    },
                    { type: 'text', text: 'foreign answer' },
                ],
            };
            await model.generate({
                messages: [
                    ...MESSAGES,
                    resultToMessage(first),
                    foreignAssistantMessage,
                    { role: 'user', content: 'and then?' },
                ],
            });

            const serializedInput = JSON.stringify(
                lastRequest(responsesCreate).input
            );
            expect(serializedInput).toContain('xai-encrypted');
            expect(serializedInput).not.toContain('openai-encrypted');
        });

        it('should tag errors with provider xai', async () => {
            responsesCreate.mockRejectedValue(new Error('upstream failure'));
            const provider = createXAI({ apiKey: 'test-key' });

            const error = await provider
                .chatModel('grok-4.7')
                .generate({ messages: MESSAGES })
                .catch((e: unknown) => e);

            expect(error).toBeInstanceOf(ProviderError);
            expect((error as ProviderError).provider).toBe('xai');
        });
    });

    describe('Chat Completions API (.chat)', () => {
        it('should call chat completions with max_completion_tokens', async () => {
            const provider = createXAI({ apiKey: 'test-key' });

            await provider.chat.chatModel('grok-4.7').generate({
                messages: MESSAGES,
                maxTokens: 100,
            });

            expect(responsesCreate).not.toHaveBeenCalled();
            expect(lastRequest(chatCreate)).toMatchObject({
                model: 'grok-4.7',
                max_completion_tokens: 100,
            });
        });

        it('should add separately reported reasoning tokens to outputTokens', async () => {
            const provider = createXAI({ apiKey: 'test-key' });

            const result = await provider.chat
                .chatModel('grok-4.7')
                .generate({ messages: MESSAGES });

            expect(result.usage.outputTokens).toBe(59);
            expect(result.usage.outputTokenDetails.reasoningTokens).toBe(58);
        });

        it('should send xhigh for max effort and nothing to models that reject effort', async () => {
            const provider = createXAI({ apiKey: 'test-key' });
            const options: GenerateOptions = {
                messages: MESSAGES,
                reasoning: { effort: 'max' },
            };

            await provider.chat.chatModel('grok-4.7').generate(options);
            expect(lastRequest(chatCreate).reasoning_effort).toBe('xhigh');

            await provider.chat.chatModel('grok-build-0.1').generate(options);
            expect(lastRequest(chatCreate).reasoning_effort).toBeUndefined();
        });

        it('should reject stop sequences, which xAI reasoning models do not accept', async () => {
            const provider = createXAI({ apiKey: 'test-key' });

            await expect(
                provider.chat.chatModel('grok-4.7').generate({
                    messages: MESSAGES,
                    providerOptions: {
                        xai: { stopSequences: ['x'] },
                    } as unknown as GenerateOptions['providerOptions'],
                })
            ).rejects.toThrowError(/unrecognized key/i);
            expect(chatCreate).not.toHaveBeenCalled();
        });

        it('should preserve reasoning_content across turns', async () => {
            chatCreate.mockResolvedValueOnce({
                ...createChatCompletion(),
                choices: [
                    {
                        index: 0,
                        finish_reason: 'stop',
                        logprobs: null,
                        message: {
                            role: 'assistant',
                            content: 'first answer',
                            refusal: null,
                            reasoning_content: 'thinking',
                        },
                    },
                ],
            });
            const model = createXAI({ apiKey: 'test-key' }).chat.chatModel(
                'grok-4.7'
            );

            const first = await model.generate({ messages: MESSAGES });
            await model.generate({
                messages: [
                    ...MESSAGES,
                    resultToMessage(first),
                    { role: 'user', content: 'and then?' },
                ],
            });

            expect(first.reasoning).toBe('thinking');
            expect(lastRequest(chatCreate).messages).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        role: 'assistant',
                        content: 'first answer',
                        reasoning_content: 'thinking',
                    }),
                ])
            );
        });
    });
});
