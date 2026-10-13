import { describe, expect, it, vi } from 'vitest';
import type { GenerateContentResponse, GoogleGenAI } from '@google/genai';
import {
    TOOL_DISCOVERY_TOOL_NAME,
    resultToMessage,
    type Message,
} from '@core-ai/core-ai';
import { createGoogleGenAIChatModel } from './chat-model.ts';

const history: Message[] = [
    { role: 'user', content: 'Book a meeting' },
    {
        role: 'assistant',
        parts: [
            {
                type: 'tool-discovery-call',
                id: 'call_1',
                query: 'calendar',
                providerMetadata: { google: { thoughtSignature: 'sig_1' } },
            },
        ],
    },
    {
        role: 'tool-discovery',
        callId: 'call_1',
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
                id: 'call_2',
                names: ['cancel_meeting'],
                providerMetadata: { google: { thoughtSignature: 'sig_2' } },
            },
        ]);
        expect(result.toolCalls).toEqual([]);
        expect(result.finishReason).toBe('tool-calls');
    });
});
