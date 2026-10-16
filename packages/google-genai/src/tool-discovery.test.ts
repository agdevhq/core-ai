import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { GenerateContentResponse, GoogleGenAI } from '@google/genai';
import {
    TOOL_DISCOVERY_TOOL_NAME,
    ValidationError,
    resultToMessage,
    type Message,
} from '@core-ai/core-ai';
import { toAsyncIterable } from '@core-ai/testing';
import {
    createGenerateRequest,
    createStructuredOutputOptions,
} from './chat-adapter.ts';
import { createGoogleGenAIChatModel } from './chat-model.ts';

const history: Message[] = [
    { role: 'user', content: 'Book a meeting' },
    {
        role: 'assistant',
        parts: [
            {
                type: 'tool-discovery-call',
                discoveryCall: { id: 'call_1', query: 'calendar' },
                providerMetadata: { google: { thoughtSignature: 'sig_1' } },
            },
        ],
    },
    {
        role: 'tool-discovery',
        discoveryCallId: 'call_1',
        tools: [
            {
                name: 'book_meeting',
                description: 'Book a meeting',
                parameters: {
                    type: 'object',
                    properties: { title: { type: 'string' } },
                },
            },
        ],
    },
];

describe('tool discovery (emulated)', () => {
    it('declares discovered tools and replays discovery as function calls', async () => {
        const generateContent = vi.fn(
            async (_request: unknown) =>
                ({
                    candidates: [
                        {
                            finishReason: 'STOP',
                            content: {
                                role: 'model',
                                parts: [
                                    {
                                        functionCall: {
                                            id: 'call_2',
                                            name: TOOL_DISCOVERY_TOOL_NAME,
                                            args: { names: ['cancel_meeting'] },
                                        },
                                        thoughtSignature: 'sig_2',
                                    },
                                ],
                            },
                        },
                    ],
                }) as unknown as GenerateContentResponse
        );
        const model = createGoogleGenAIChatModel(
            {
                models: { generateContent },
            } as unknown as Pick<GoogleGenAI, 'models'>,
            'gemini-3-flash'
        );

        const result = await model.generate({
            messages: history,
            toolDiscovery: {},
        });

        const request = generateContent.mock.calls[0]?.[0] as {
            contents: unknown[];
            config: {
                tools: { functionDeclarations: { name: string }[] }[];
            };
        };
        expect(
            request.config.tools[0]?.functionDeclarations.map(
                (declaration) => declaration.name
            )
        ).toEqual([TOOL_DISCOVERY_TOOL_NAME, 'book_meeting']);
        expect(request.contents.slice(1)).toEqual([
            {
                role: 'model',
                parts: [
                    {
                        functionCall: {
                            id: 'call_1',
                            name: TOOL_DISCOVERY_TOOL_NAME,
                            args: { query: 'calendar' },
                        },
                        thoughtSignature: 'sig_1',
                    },
                ],
            },
            {
                role: 'user',
                parts: [
                    {
                        functionResponse: {
                            id: 'call_1',
                            name: TOOL_DISCOVERY_TOOL_NAME,
                            response: {
                                output: 'Discovered tools: book_meeting. You can call them now.',
                            },
                        },
                    },
                ],
            },
        ]);
        expect(resultToMessage(result).parts).toEqual([
            {
                type: 'tool-discovery-call',
                discoveryCall: { id: 'call_2', names: ['cancel_meeting'] },
                providerMetadata: { google: { thoughtSignature: 'sig_2' } },
            },
        ]);
        expect(result.toolCalls).toEqual([]);
        expect(result.finishReason).toBe('tool-calls');
    });

    it('declares a strict discovered tool without strict instead of throwing', async () => {
        const generateContent = vi.fn(
            async (_request: unknown) =>
                ({
                    candidates: [
                        {
                            finishReason: 'STOP',
                            content: {
                                role: 'model',
                                parts: [{ text: 'Booked.' }],
                            },
                        },
                    ],
                }) as unknown as GenerateContentResponse
        );
        const model = createGoogleGenAIChatModel(
            {
                models: { generateContent },
            } as unknown as Pick<GoogleGenAI, 'models'>,
            'gemini-3-flash'
        );
        const [user, assistant, discoveryResult] = history;
        if (discoveryResult?.role !== 'tool-discovery' || !user || !assistant) {
            throw new Error('unexpected history');
        }

        await model.generate({
            messages: [
                user,
                assistant,
                {
                    ...discoveryResult,
                    tools: discoveryResult.tools.map((tool) => ({
                        ...tool,
                        parameters: { ...tool.parameters, required: ['title'] },
                        strict: true,
                    })),
                },
            ],
            toolDiscovery: {},
        });

        const request = generateContent.mock.calls[0]?.[0] as {
            config: {
                tools: { functionDeclarations: { name: string }[] }[];
            };
        };
        expect(
            request.config.tools[0]?.functionDeclarations.map(
                (declaration) => declaration.name
            )
        ).toEqual([TOOL_DISCOVERY_TOOL_NAME, 'book_meeting']);
    });
});

describe('tool discovery in streams', () => {
    it('streams a call to the discovery tool as one discovery call event', async () => {
        const model = createGoogleGenAIChatModel(
            {
                models: {
                    generateContentStream: async () =>
                        toAsyncIterable([
                            {
                                candidates: [
                                    {
                                        finishReason: 'STOP',
                                        content: {
                                            role: 'model',
                                            parts: [
                                                {
                                                    functionCall: {
                                                        id: 'call_2',
                                                        name: TOOL_DISCOVERY_TOOL_NAME,
                                                        args: {
                                                            names: [
                                                                'cancel_meeting',
                                                            ],
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                            },
                        ]),
                },
            } as unknown as Pick<GoogleGenAI, 'models'>,
            'gemini-3-flash'
        );

        const stream = await model.stream({
            messages: history,
            toolDiscovery: {},
        });

        const types = (await stream.events).map((event) => event.type);
        expect(types).toContain('tool-discovery-call');
        expect(types).not.toContain('tool-call-start');
        expect((await stream.result).discoveryCalls).toEqual([
            { id: 'call_2', names: ['cancel_meeting'] },
        ]);
    });
});

describe('structured output after tool discovery', () => {
    const schema = z.object({ title: z.string() });

    it('declares only the structured output tool', () => {
        const request = createGenerateRequest(
            'gemini-3-flash',
            createStructuredOutputOptions({ messages: history, schema })
        ) as unknown as {
            config: {
                tools: { functionDeclarations: { name: string }[] }[];
            };
        };

        expect(
            request.config.tools[0]?.functionDeclarations.map(
                (declaration) => declaration.name
            )
        ).toEqual(['core_ai_generate_object']);
    });

    it('rejects an unanswered discovery call', () => {
        expect(() =>
            createStructuredOutputOptions({
                messages: history.slice(0, 2),
                schema,
            })
        ).toThrow(ValidationError);
    });
});
