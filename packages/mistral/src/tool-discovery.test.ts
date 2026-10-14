import { describe, expect, it, vi } from 'vitest';
import type { Mistral } from '@mistralai/mistralai';
import { TOOL_DISCOVERY_TOOL_NAME, type Message } from '@core-ai/core-ai';
import { toAsyncIterable } from '@core-ai/testing';
import { createMistralChatModel } from './chat-model.ts';

const history: Message[] = [
    { role: 'user', content: 'Book a meeting' },
    {
        role: 'assistant',
        parts: [
            {
                type: 'tool-discovery-call',
                discoveryCall: { id: 'call_1', names: ['book'] },
            },
        ],
    },
    {
        role: 'tool-discovery',
        discoveryCallId: 'call_1',
        tools: [],
        note: 'Nothing matches "book".',
    },
];

describe('tool discovery (emulated)', () => {
    it('renders discovery as ordinary tool calls and maps the response', async () => {
        const complete = vi.fn(async (_request: unknown) => ({
            id: 'cmpl_1',
            object: 'chat.completion',
            model: 'mistral-medium-latest',
            created: 0,
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
            choices: [
                {
                    index: 0,
                    finishReason: 'tool_calls',
                    message: {
                        role: 'assistant',
                        content: null,
                        toolCalls: [
                            {
                                id: 'call_2',
                                type: 'function',
                                function: {
                                    name: TOOL_DISCOVERY_TOOL_NAME,
                                    arguments: '{"query":"calendar"}',
                                },
                            },
                        ],
                    },
                },
            ],
        }));
        const model = createMistralChatModel(
            { chat: { complete } } as unknown as Pick<Mistral, 'chat'>,
            'mistral-medium-latest'
        );

        const result = await model.generate({
            messages: history,
            toolDiscovery: {},
        });

        const request = complete.mock.calls[0]?.[0] as {
            tools: { function: { name: string } }[];
            messages: unknown[];
        };
        expect(request.tools.map((tool) => tool.function.name)).toEqual([
            TOOL_DISCOVERY_TOOL_NAME,
        ]);
        expect(request.messages.slice(1)).toEqual([
            {
                role: 'assistant',
                content: null,
                toolCalls: [
                    {
                        id: 'call_1',
                        type: 'function',
                        function: {
                            name: TOOL_DISCOVERY_TOOL_NAME,
                            arguments: { names: ['book'] },
                        },
                    },
                ],
            },
            {
                role: 'tool',
                toolCallId: 'call_1',
                content: 'Nothing matches "book".',
            },
        ]);
        expect(result.parts).toEqual([
            {
                type: 'tool-discovery-call',
                discoveryCall: { id: 'call_2', query: 'calendar' },
            },
        ]);
        expect(result.toolCalls).toEqual([]);
    });

    it('streams a discovery call as a single tool-discovery-call event', async () => {
        const stream = vi.fn(async (_request: unknown) =>
            toAsyncIterable([
                {
                    data: {
                        id: 'chunk_1',
                        object: 'chat.completion.chunk',
                        model: 'mistral-medium-latest',
                        created: 0,
                        choices: [
                            {
                                index: 0,
                                finishReason: 'tool_calls',
                                delta: {
                                    toolCalls: [
                                        {
                                            id: 'call_2',
                                            type: 'function',
                                            index: 0,
                                            function: {
                                                name: TOOL_DISCOVERY_TOOL_NAME,
                                                arguments:
                                                    '{"query":"calendar"}',
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },
            ])
        );
        const model = createMistralChatModel(
            { chat: { stream } } as unknown as Pick<Mistral, 'chat'>,
            'mistral-medium-latest'
        );

        const chatStream = await model.stream({
            messages: history,
            toolDiscovery: {},
        });

        // Mistral sends the arguments in the chunk that opens the call, so a
        // start emitted after the delta would leak the delta.
        expect(
            (await chatStream.events).filter((event) =>
                event.type.startsWith('tool-')
            )
        ).toEqual([
            {
                type: 'tool-discovery-call',
                discoveryCall: { id: 'call_2', query: 'calendar' },
            },
        ]);
    });
});
