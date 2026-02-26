import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
    FinishReason as GoogleFinishReason,
    type GenerateContentResponse,
    type GoogleGenAI,
} from '@google/genai';
import {
    ProviderError,
    StructuredOutputValidationError,
} from '@core-ai/core-ai';
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
            inputTokenDetails: {
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
            },
            outputTokenDetails: {
                reasoningTokens: 0,
            },
        });

        expect(generateContent).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
            })
        );
    });

    it('should map cached and reasoning usage metadata', async () => {
        const generateContent = vi.fn(async () => {
            return asGenerateContentResponse({
                text: 'Hello with cache',
                candidates: [
                    {
                        finishReason: GoogleFinishReason.STOP,
                    },
                ],
                usageMetadata: {
                    promptTokenCount: 20,
                    candidatesTokenCount: 5,
                    thoughtsTokenCount: 3,
                    cachedContentTokenCount: 12,
                    totalTokenCount: 28,
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

        expect(result.usage).toEqual({
            inputTokens: 20,
            outputTokens: 8,
            inputTokenDetails: {
                cacheReadTokens: 12,
                cacheWriteTokens: 0,
            },
            outputTokenDetails: {
                reasoningTokens: 3,
            },
        });
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

    it('should generate a validated structured object', async () => {
        const generateContent = vi.fn(async () => {
            return asGenerateContentResponse({
                functionCalls: [
                    {
                        id: 'tc_1',
                        name: 'weather_schema',
                        args: {
                            city: 'Berlin',
                            temperatureC: 21,
                        },
                    },
                ],
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
        const schema = z.object({
            city: z.string(),
            temperatureC: z.number(),
        });

        const result = await model.generateObject({
            messages: [{ role: 'user', content: 'Return weather JSON' }],
            schema,
            schemaName: 'weather_schema',
        });

        expect(result.object).toEqual({
            city: 'Berlin',
            temperatureC: 21,
        });
        expect(result.finishReason).toBe('tool-calls');
    });

    it('should throw validation error for invalid structured output', async () => {
        const generateContent = vi.fn(async () => {
            return asGenerateContentResponse({
                functionCalls: [
                    {
                        id: 'tc_1',
                        name: 'weather_schema',
                        args: {
                            city: 'Berlin',
                            temperatureC: 'warm',
                        },
                    },
                ],
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
        const schema = z.object({
            city: z.string(),
            temperatureC: z.number(),
        });

        await expect(
            model.generateObject({
                messages: [{ role: 'user', content: 'Return weather JSON' }],
                schema,
                schemaName: 'weather_schema',
            })
        ).rejects.toBeInstanceOf(StructuredOutputValidationError);
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
            inputTokenDetails: {
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
            },
            outputTokenDetails: {
                reasoningTokens: 0,
            },
        });
    });

    it('should map cached and reasoning usage in stream responses', async () => {
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
                        promptTokenCount: 25,
                        candidatesTokenCount: 6,
                        thoughtsTokenCount: 2,
                        cachedContentTokenCount: 16,
                        totalTokenCount: 33,
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

        for await (const _event of streamResult) {
            // Consume stream.
        }

        const response = await streamResult.toResponse();
        expect(response.usage).toEqual({
            inputTokens: 25,
            outputTokens: 8,
            inputTokenDetails: {
                cacheReadTokens: 16,
                cacheWriteTokens: 0,
            },
            outputTokenDetails: {
                reasoningTokens: 2,
            },
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
        expect(events.some((event) => event.type === 'tool-call-end')).toBe(
            true
        );

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

    it('should stream and aggregate structured object output', async () => {
        const generateContentStream = vi.fn(async () => {
            return toAsyncIterable<GenerateContentResponse>([
                asGenerateContentResponse({
                    functionCalls: [
                        {
                            id: 'tc_1',
                            name: 'weather_schema',
                            args: {
                                city: 'Berlin',
                                temperatureC: 21,
                            },
                        },
                    ],
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
        const schema = z.object({
            city: z.string(),
            temperatureC: z.number(),
        });

        const streamResult = await model.streamObject({
            messages: [{ role: 'user', content: 'Return weather JSON' }],
            schema,
            schemaName: 'weather_schema',
        });

        const objects: Array<{ city: string; temperatureC: number }> = [];
        for await (const event of streamResult) {
            if (event.type === 'object') {
                objects.push(event.object);
            }
        }

        expect(objects).toEqual([{ city: 'Berlin', temperatureC: 21 }]);
        const response = await streamResult.toResponse();
        expect(response.object).toEqual({
            city: 'Berlin',
            temperatureC: 21,
        });
        expect(response.finishReason).toBe('tool-calls');
    });
});

function createMockClient(overrides?: {
    generateContent?: (options: unknown) => Promise<unknown>;
    generateContentStream?: (options: unknown) => Promise<unknown>;
}): Pick<GoogleGenAI, 'models'> {
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
