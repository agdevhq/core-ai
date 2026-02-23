import { describe, expect, it, vi } from 'vitest';
import {
    FinishReason as GoogleFinishReason,
    type GenerateContentResponse,
    type GoogleGenAI,
} from '@google/genai';
import { ProviderError } from '@core-ai/core-ai';
import { createGoogleGenAIChatModel } from './chat-model.js';

describe('createGoogleGenAIChatModel', () => {
    it('should create model metadata', () => {
        const model = createGoogleGenAIChatModel(
            createMockClient(),
            'gemini-2.5-flash'
        );

        expect(model.provider).toBe('google');
        expect(model.modelId).toBe('gemini-2.5-flash');
    });
});

describe('generate', () => {
    it('should map a text response', async () => {
        const generateContent = vi.fn(async () => {
            return asGenerateContentResponse({
                text: 'Hello!',
                candidates: [
                    {
                        finishReason: GoogleFinishReason.STOP,
                    },
                ],
                usageMetadata: {
                    promptTokenCount: 10,
                    candidatesTokenCount: 5,
                    totalTokenCount: 15,
                },
            });
        });
        const model = createGoogleGenAIChatModel(
            createMockClient({ generateContent }),
            'gemini-2.5-flash'
        );

        const result = await model.generate({
            messages: [{ role: 'user', content: 'Hi' }],
        });

        expect(result.content).toBe('Hello!');
        expect(result.toolCalls).toEqual([]);
        expect(result.finishReason).toBe('stop');
        expect(result.usage).toEqual({
            inputTokens: 10,
            outputTokens: 5,
            reasoningTokens: 0,
            totalTokens: 15,
        });

        expect(generateContent).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
            })
        );
    });

    it('should map tool call responses', async () => {
        const generateContent = vi.fn(async () => {
            return asGenerateContentResponse({
                functionCalls: [
                    {
                        id: 'tc_1',
                        name: 'search',
                        args: { query: 'weather' },
                    },
                ],
                candidates: [
                    {
                        finishReason: GoogleFinishReason.STOP,
                    },
                ],
                usageMetadata: {
                    promptTokenCount: 10,
                    candidatesTokenCount: 20,
                    totalTokenCount: 30,
                },
            });
        });
        const model = createGoogleGenAIChatModel(
            createMockClient({ generateContent }),
            'gemini-2.5-flash'
        );

        const result = await model.generate({
            messages: [{ role: 'user', content: 'weather?' }],
        });

        expect(result.finishReason).toBe('tool-calls');
        expect(result.toolCalls).toEqual([
            {
                id: 'tc_1',
                name: 'search',
                arguments: { query: 'weather' },
            },
        ]);
    });

    it('should wrap provider errors', async () => {
        const generateContent = vi.fn(async () => {
            throw new Error('network failed');
        });
        const model = createGoogleGenAIChatModel(
            createMockClient({ generateContent }),
            'gemini-2.5-flash'
        );

        await expect(
            model.generate({
                messages: [{ role: 'user', content: 'hello' }],
            })
        ).rejects.toBeInstanceOf(ProviderError);
    });
});

describe('stream', () => {
    it('should stream content and aggregate response', async () => {
        const generateContentStream = vi.fn(async () => {
            return toAsyncIterable<GenerateContentResponse>([
                asGenerateContentResponse({
                    text: 'Hello ',
                    candidates: [],
                }),
                asGenerateContentResponse({
                    text: 'world',
                    candidates: [{ finishReason: GoogleFinishReason.STOP }],
                    usageMetadata: {
                        promptTokenCount: 10,
                        candidatesTokenCount: 2,
                        totalTokenCount: 12,
                    },
                }),
            ]);
        });
        const model = createGoogleGenAIChatModel(
            createMockClient({ generateContentStream }),
            'gemini-2.5-flash'
        );

        const streamResult = await model.stream({
            messages: [{ role: 'user', content: 'hello' }],
        });

        const events: string[] = [];
        for await (const event of streamResult) {
            if (event.type === 'content-delta') {
                events.push(event.text);
            }
        }

        expect(events.join('')).toBe('Hello world');
        const response = await streamResult.toResponse();
        expect(response.content).toBe('Hello world');
        expect(response.finishReason).toBe('stop');
        expect(response.usage).toEqual({
            inputTokens: 10,
            outputTokens: 2,
            reasoningTokens: 0,
            totalTokens: 12,
        });
    });

    it('should emit tool call events in stream', async () => {
        const generateContentStream = vi.fn(async () => {
            return toAsyncIterable<GenerateContentResponse>([
                asGenerateContentResponse({
                    functionCalls: [
                        {
                            id: 'tc_1',
                            name: 'search',
                            args: { query: 'weather' },
                        },
                    ],
                    candidates: [{ finishReason: GoogleFinishReason.STOP }],
                }),
            ]);
        });
        const model = createGoogleGenAIChatModel(
            createMockClient({ generateContentStream }),
            'gemini-2.5-flash'
        );

        const streamResult = await model.stream({
            messages: [{ role: 'user', content: 'weather?' }],
        });
        const events = [];
        for await (const event of streamResult) {
            events.push(event);
        }

        expect(events.some((event) => event.type === 'tool-call-start')).toBe(
            true
        );
        expect(events.some((event) => event.type === 'tool-call-end')).toBe(true);

        const response = await streamResult.toResponse();
        expect(response.finishReason).toBe('tool-calls');
        expect(response.toolCalls).toEqual([
            {
                id: 'tc_1',
                name: 'search',
                arguments: { query: 'weather' },
            },
        ]);
    });
});

function createMockClient(
    overrides?: {
        generateContent?: (options: unknown) => Promise<unknown>;
        generateContentStream?: (options: unknown) => Promise<unknown>;
    }
): Pick<GoogleGenAI, 'models'> {
    const generateContent =
        overrides?.generateContent ??
        (async () => {
            throw new Error('generateContent not implemented');
        });
    const generateContentStream =
        overrides?.generateContentStream ??
        (async () => {
            throw new Error('generateContentStream not implemented');
        });

    return {
        models: {
            generateContent,
            generateContentStream,
        },
    } as unknown as Pick<GoogleGenAI, 'models'>;
}

function asGenerateContentResponse(
    value: Partial<GenerateContentResponse>
): GenerateContentResponse {
    return {
        candidates: [],
        ...value,
    } as GenerateContentResponse;
}

async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
    for (const item of items) {
        yield item;
    }
}
