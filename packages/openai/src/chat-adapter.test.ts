import { describe, expect, it } from 'vitest';
import type { Response, ResponseStreamEvent } from 'openai/resources/responses/responses';
import { ProviderError, type Message } from '@core-ai/core-ai';
import {
    convertMessages,
    createGenerateRequest,
    mapGenerateResponse,
    transformStream,
    validateOpenAIReasoningConfig,
} from './chat-adapter.js';

describe('convertMessages', () => {
    it('should convert system messages to developer role', () => {
        const messages: Message[] = [
            { role: 'system', content: 'You are helpful.' },
        ];

        expect(convertMessages(messages)).toEqual([
            { role: 'developer', content: 'You are helpful.' },
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
                        providerMetadata: {
                            encryptedContent: 'enc_123',
                        },
                    },
                    { type: 'text', text: 'answer' },
                    {
                        type: 'tool-call',
                        toolCall: {
                            id: 'tc_1',
                            name: 'search',
                            arguments: { query: 'weather' },
                        },
                    },
                ],
            },
            {
                role: 'tool',
                toolCallId: 'tc_1',
                content: 'Sunny, 72F',
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
    it('should include reasoning summary and encrypted reasoning include', () => {
        const request = createGenerateRequest('gpt-5-mini', {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'high' },
            providerOptions: {
                include: ['foo.bar'],
                store: false,
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

    it('should keep encrypted include even when store is false', () => {
        const request = createGenerateRequest('gpt-5-mini', {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'medium' },
            providerOptions: {
                store: false,
            },
        });

        expect(request.store).toBe(false);
        expect(request.include).toEqual(['reasoning.encrypted_content']);
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
                    encryptedContent: 'enc_1',
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

    it('should omit encryptedContent metadata when not provided', () => {
        const response = asResponse({
            output: [
                {
                    type: 'reasoning',
                    summary: [{ type: 'summary_text', text: 'stored mode summary' }],
                },
            ],
            status: 'completed',
        });

        const result = mapGenerateResponse(response);
        const reasoningPart = result.parts[0];

        expect(reasoningPart).toEqual({
            type: 'reasoning',
            text: 'stored mode summary',
        });
    });
});

describe('transformStream', () => {
    it('should map reasoning, tool call, text, and finish events', async () => {
        const stream = toAsyncIterable<ResponseStreamEvent>([
            asStreamEvent({
                type: 'response.reasoning_summary_text.delta',
                delta: 'think',
            }),
            asStreamEvent({
                type: 'response.reasoning_summary_text.done',
                text: 'think',
            }),
            asStreamEvent({
                type: 'response.output_item.added',
                output_index: 0,
                item: {
                    type: 'function_call',
                    call_id: 'tc_1',
                    name: 'search',
                    arguments: '',
                },
            }),
            asStreamEvent({
                type: 'response.function_call_arguments.delta',
                output_index: 0,
                item_id: 'item_1',
                delta: '{"query":"wea',
            }),
            asStreamEvent({
                type: 'response.function_call_arguments.delta',
                output_index: 0,
                item_id: 'item_1',
                delta: 'ther"}',
            }),
            asStreamEvent({
                type: 'response.output_item.done',
                output_index: 0,
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
            { type: 'reasoning-end' },
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
            { type: 'text-delta', text: 'answer' },
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
});

describe('validateOpenAIReasoningConfig', () => {
    it('should reject temperature/topP for restricted models', () => {
        expect(() =>
            validateOpenAIReasoningConfig('gpt-5.2', {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'medium' },
                config: { temperature: 0.2 },
            })
        ).toThrowError(ProviderError);

        expect(() =>
            validateOpenAIReasoningConfig('gpt-5.1', {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'medium' },
                config: { topP: 0.9 },
            })
        ).toThrowError(ProviderError);
    });
});

function asResponse(value: unknown): Response {
    return value as Response;
}

function asStreamEvent(value: unknown): ResponseStreamEvent {
    return value as ResponseStreamEvent;
}

async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
    for (const item of items) {
        yield item;
    }
}
