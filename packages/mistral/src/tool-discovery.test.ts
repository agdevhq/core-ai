import { describe, expect, it, vi } from 'vitest';
import type { Mistral } from '@mistralai/mistralai';
import { TOOL_DISCOVERY_TOOL_NAME, type Message } from '@core-ai/core-ai';
import { createMistralChatModel } from './chat-model.ts';

const history: Message[] = [
    { role: 'user', content: 'Book a meeting' },
    {
        role: 'assistant',
        parts: [{ type: 'tool-discovery-call', id: 'call_1', names: ['book'] }],
    },
    {
        role: 'tool-discovery',
        callId: 'call_1',
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
            { type: 'tool-discovery-call', id: 'call_2', query: 'calendar' },
        ]);
        expect(result.toolCalls).toEqual([]);
    });
});
