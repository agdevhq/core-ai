import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type OpenAI from 'openai';
import type {
    Response,
    ResponseStreamEvent,
} from 'openai/resources/responses/responses';
import type { ChatCompletion } from 'openai/resources/chat/completions/completions';
import {
    createChatStream,
    TOOL_DISCOVERY_TOOL_NAME,
    type GenerateOptions,
    type Message,
    type ToolSnapshot,
} from '@core-ai/core-ai';
import { toAsyncIterable } from '@core-ai/testing';
import {
    createGenerateRequest,
    mapGenerateResponse,
    transformStream,
} from './chat-adapter.ts';
import { createOpenAIChatCompletionsModel } from './chat-completions/chat-model.ts';
import {
    getOpenAIModelCapabilities,
    toOpenAIResponsesCapabilities,
} from './model-capabilities.ts';

const NATIVE_MODEL = 'gpt-5.4';
const EMULATED_MODEL = 'gpt-5.2';

const bookMeeting: ToolSnapshot = {
    name: 'book_meeting',
    description: 'Book a meeting',
    parameters: {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: ['title'],
    },
};

const cancelMeeting: ToolSnapshot = {
    name: 'cancel_meeting',
    description: 'Cancel a meeting',
    parameters: { type: 'object', properties: { id: { type: 'string' } } },
};

const searchTool = {
    name: 'search',
    description: 'Search the web',
    parameters: z.object({ query: z.string() }),
};

function createHistory(note?: string): Message[] {
    return [
        { role: 'user', content: 'Book a meeting about the launch' },
        {
            role: 'assistant',
            parts: [
                {
                    type: 'tool-discovery-call',
                    discoveryCall: {
                        id: 'call_discover',
                        names: ['book_meeting', 'search'],
                    },
                },
                {
                    type: 'tool-call',
                    toolCall: {
                        id: 'call_search',
                        name: 'search',
                        arguments: { query: 'launch date' },
                    },
                },
            ],
        },
        {
            role: 'tool-discovery',
            discoveryCallId: 'call_discover',
            tools: [
                bookMeeting,
                { ...cancelMeeting, name: 'search' },
                cancelMeeting,
            ],
            ...(note ? { note } : {}),
        },
        { role: 'tool', toolCallId: 'call_search', content: 'Friday' },
        {
            role: 'assistant',
            parts: [
                {
                    type: 'tool-call',
                    toolCall: {
                        id: 'call_book',
                        name: 'book_meeting',
                        arguments: { title: 'Launch' },
                    },
                },
            ],
        },
        { role: 'tool', toolCallId: 'call_book', content: 'Booked.' },
    ];
}

function createRequest(
    options: Partial<GenerateOptions> = {},
    modelId = NATIVE_MODEL
) {
    return createGenerateRequest(
        modelId,
        {
            messages: createHistory('The CRM source is unavailable.'),
            tools: { search: searchTool },
            toolDiscovery: { description: 'Discoverable: calendar tools.' },
            ...options,
        },
        {
            capabilities: toOpenAIResponsesCapabilities(
                getOpenAIModelCapabilities(modelId)
            ),
        }
    ) as unknown as {
        tools?: Record<string, unknown>[];
        input: Record<string, unknown>[];
    };
}

describe('tool discovery capability', () => {
    it('is native from GPT-5.4 on the Responses API', () => {
        expect(
            getOpenAIModelCapabilities('gpt-5.4-mini').tools.toolDiscovery
        ).toBe('native');
        expect(
            getOpenAIModelCapabilities('gpt-6-sol').tools.toolDiscovery
        ).toBe('native');
        expect(
            getOpenAIModelCapabilities(EMULATED_MODEL).tools.toolDiscovery
        ).toBe('emulated');
        expect(
            getOpenAIModelCapabilities('my-azure-deployment').tools
                .toolDiscovery
        ).toBe('emulated');
    });

    it.each(['gpt-5.4-nano', 'gpt-5.5-pro'])(
        'is emulated on %s, which lacks tool search',
        (modelId) => {
            expect(
                getOpenAIModelCapabilities(modelId).tools.toolDiscovery
            ).toBe('emulated');
        }
    );

    it('is emulated on Chat Completions', () => {
        const model = createOpenAIChatCompletionsModel(
            { chat: {} as OpenAI['chat'] },
            NATIVE_MODEL,
            { capabilities: getOpenAIModelCapabilities(NATIVE_MODEL) }
        );

        expect(model.capabilities.tools.toolDiscovery).toBe('emulated');
    });
});

describe('native tool discovery', () => {
    it('declares the caller tools and a client tool_search tool', () => {
        expect(createRequest().tools).toEqual([
            {
                type: 'function',
                name: 'search',
                description: 'Search the web',
                parameters: expect.objectContaining({ type: 'object' }),
                strict: false,
            },
            {
                type: 'tool_search',
                execution: 'client',
                description: expect.stringMatching(
                    /^Discovers tools[\s\S]*\n\nDiscoverable: calendar tools\.$/
                ),
                parameters: expect.objectContaining({
                    properties: expect.objectContaining({
                        names: expect.any(Object),
                        query: expect.any(Object),
                    }),
                }),
            },
        ]);
    });

    it('renders discovery calls and results as tool search items, notes after the step', () => {
        const { input } = createRequest();

        expect(input.slice(1, 6)).toEqual([
            {
                type: 'tool_search_call',
                call_id: 'call_discover',
                execution: 'client',
                status: 'completed',
                arguments: { names: ['book_meeting', 'search'] },
            },
            {
                type: 'function_call',
                call_id: 'call_search',
                name: 'search',
                arguments: '{"query":"launch date"}',
            },
            {
                type: 'tool_search_output',
                call_id: 'call_discover',
                execution: 'client',
                status: 'completed',
                tools: [
                    {
                        type: 'function',
                        name: 'book_meeting',
                        description: 'Book a meeting',
                        parameters: bookMeeting.parameters,
                        strict: false,
                        defer_loading: true,
                    },
                    {
                        type: 'function',
                        name: 'cancel_meeting',
                        description: 'Cancel a meeting',
                        parameters: cancelMeeting.parameters,
                        strict: false,
                        defer_loading: true,
                    },
                ],
            },
            {
                type: 'function_call_output',
                call_id: 'call_search',
                output: 'Friday',
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'input_text',
                        text: 'The CRM source is unavailable.',
                    },
                ],
            },
        ]);
    });

    it('loads a rediscovered tool once, with its latest snapshot', () => {
        const history: Message[] = [
            ...createHistory(),
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'tool-discovery-call',
                        discoveryCall: {
                            id: 'call_rediscover',
                            names: ['book_meeting'],
                        },
                    },
                ],
            },
            {
                role: 'tool-discovery',
                discoveryCallId: 'call_rediscover',
                tools: [{ ...bookMeeting, description: 'Book a meeting v2' }],
            },
        ];

        const outputs = createRequest({ messages: history }).input.filter(
            (item) => item.type === 'tool_search_output'
        );

        expect(outputs.map((output) => output.tools)).toEqual([
            [
                expect.objectContaining({
                    name: 'book_meeting',
                    description: 'Book a meeting v2',
                }),
                expect.objectContaining({ name: 'cancel_meeting' }),
            ],
            [],
        ]);
        expect(createRequest({ messages: history }).input.at(-1)).toEqual({
            role: 'user',
            content: [
                {
                    type: 'input_text',
                    text: 'Discovered tools: book_meeting. You can call them now.',
                },
            ],
        });
    });

    it('tells the model when a discovery found nothing', () => {
        const history = createHistory();
        history[2] = {
            role: 'tool-discovery',
            discoveryCallId: 'call_discover',
            tools: [],
        };

        const { input } = createRequest({ messages: history });

        expect(input.slice(3, 6)).toEqual([
            expect.objectContaining({ type: 'tool_search_output', tools: [] }),
            expect.objectContaining({ type: 'function_call_output' }),
            {
                role: 'user',
                content: [
                    {
                        type: 'input_text',
                        text: 'No matching tools were found.',
                    },
                ],
            },
        ]);
    });

    it('adds no namespace to calls made before the tool was discovered', () => {
        const history: Message[] = [
            { role: 'user', content: 'Book it' },
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'tool-call',
                        toolCall: {
                            id: 'call_early',
                            name: 'book_meeting',
                            arguments: { title: 'Launch' },
                        },
                    },
                ],
            },
            { role: 'tool', toolCallId: 'call_early', content: 'Booked.' },
            ...createHistory().slice(1),
        ];

        const calls = createRequest({ messages: history }).input.filter(
            (item) => item.name === 'book_meeting'
        );

        expect(calls).toEqual([
            expect.not.objectContaining({ namespace: expect.anything() }),
            expect.objectContaining({ namespace: 'book_meeting' }),
        ]);
    });

    it('replays calls to discovered tools with their namespace', () => {
        const { input } = createRequest();

        expect(input[6]).toEqual({
            type: 'function_call',
            call_id: 'call_book',
            name: 'book_meeting',
            namespace: 'book_meeting',
            arguments: '{"title":"Launch"}',
        });
    });

    it('normalizes strict discovered tools', () => {
        const history = createHistory();
        history[2] = {
            role: 'tool-discovery',
            discoveryCallId: 'call_discover',
            tools: [{ ...bookMeeting, strict: true }],
        };

        const output = createRequest({ messages: history }).input.find(
            (item) => item.type === 'tool_search_output'
        );

        expect(output?.tools).toEqual([
            expect.objectContaining({
                name: 'book_meeting',
                strict: true,
                parameters: {
                    ...bookMeeting.parameters,
                    additionalProperties: false,
                },
            }),
        ]);
    });
});

describe('emulated tool discovery', () => {
    it.each([
        ['a model without tool search', {}, EMULATED_MODEL],
        [
            'the emulateToolDiscovery option',
            { providerOptions: { openai: { emulateToolDiscovery: true } } },
            NATIVE_MODEL,
        ],
    ] as const)(
        'declares ordinary functions for %s',
        (_label, options, modelId) => {
            const request = createRequest(options, modelId);

            expect(request.tools?.map((tool) => tool.name)).toEqual([
                'search',
                TOOL_DISCOVERY_TOOL_NAME,
                'book_meeting',
                'cancel_meeting',
            ]);
            expect(request.input.slice(1, 4)).toEqual([
                {
                    type: 'function_call',
                    call_id: 'call_discover',
                    name: TOOL_DISCOVERY_TOOL_NAME,
                    arguments: '{"names":["book_meeting","search"]}',
                },
                expect.objectContaining({ call_id: 'call_search' }),
                {
                    type: 'function_call_output',
                    call_id: 'call_discover',
                    output: 'Discovered tools: book_meeting, search, cancel_meeting. You can call them now.\n\nThe CRM source is unavailable.',
                },
            ]);
            expect(request.input[5]).not.toHaveProperty('namespace');
        }
    );
});

describe('discovery calls in responses', () => {
    const toolSearchCall = {
        type: 'tool_search_call',
        id: 'tsc_1',
        call_id: 'call_discover',
        execution: 'client',
        status: 'completed',
        arguments: { query: 'calendar' },
    };

    it('maps a client tool_search_call to a discovery call', () => {
        const result = mapGenerateResponse({
            status: 'completed',
            output: [toolSearchCall],
        } as unknown as Response);

        expect(result.parts).toEqual([
            {
                type: 'tool-discovery-call',
                discoveryCall: { id: 'call_discover', query: 'calendar' },
            },
        ]);
        expect(result.discoveryCalls).toEqual([
            { id: 'call_discover', query: 'calendar' },
        ]);
        expect(result.toolCalls).toEqual([]);
        expect(result.finishReason).toBe('tool-calls');
    });

    it('streams a client tool_search_call as a discovery call', async () => {
        const events = [
            {
                type: 'response.output_item.added',
                output_index: 0,
                item: { ...toolSearchCall, status: 'in_progress' },
            },
            {
                type: 'response.output_item.done',
                output_index: 0,
                item: toolSearchCall,
            },
            {
                type: 'response.completed',
                response: { status: 'completed', output: [toolSearchCall] },
            },
        ] as unknown as ResponseStreamEvent[];

        const stream = createChatStream(
            transformStream(toAsyncIterable(events))
        );
        const result = await stream.result;

        expect((await stream.events).map((event) => event.type)).toEqual([
            'tool-discovery-call',
            'finish',
        ]);
        expect(result.parts).toEqual([
            {
                type: 'tool-discovery-call',
                discoveryCall: { id: 'call_discover', query: 'calendar' },
            },
        ]);
        expect(result.discoveryCalls).toEqual([
            { id: 'call_discover', query: 'calendar' },
        ]);
        expect(result.finishReason).toBe('tool-calls');
    });
});

describe('Chat Completions tool discovery', () => {
    it('emulates discovery and maps calls to the discovery tool', async () => {
        const create = vi.fn(
            async (_request: unknown) =>
                ({
                    choices: [
                        {
                            index: 0,
                            finish_reason: 'tool_calls',
                            message: {
                                role: 'assistant',
                                content: null,
                                tool_calls: [
                                    {
                                        id: 'call_2',
                                        type: 'function',
                                        function: {
                                            name: TOOL_DISCOVERY_TOOL_NAME,
                                            arguments:
                                                '{"names":["cancel_meeting"]}',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                }) as unknown as ChatCompletion
        );
        const model = createOpenAIChatCompletionsModel(
            {
                chat: {
                    completions: { create },
                } as unknown as OpenAI['chat'],
            },
            NATIVE_MODEL,
            { capabilities: getOpenAIModelCapabilities(NATIVE_MODEL) }
        );

        const result = await model.generate({
            messages: createHistory(),
            tools: { search: searchTool },
            toolDiscovery: {},
        });

        const request = create.mock.calls[0]?.[0] as {
            tools: { function: { name: string } }[];
            messages: Record<string, unknown>[];
        };
        expect(request.tools.map((tool) => tool.function.name)).toEqual([
            'search',
            TOOL_DISCOVERY_TOOL_NAME,
            'book_meeting',
            'cancel_meeting',
        ]);
        expect(request.messages[2]).toEqual({
            role: 'tool',
            tool_call_id: 'call_discover',
            content:
                'Discovered tools: book_meeting, search, cancel_meeting. You can call them now.',
        });
        expect(result.parts).toEqual([
            {
                type: 'tool-discovery-call',
                discoveryCall: { id: 'call_2', names: ['cancel_meeting'] },
            },
        ]);
        expect(result.toolCalls).toEqual([]);
        expect(result.discoveryCalls).toEqual([
            { id: 'call_2', names: ['cancel_meeting'] },
        ]);
        expect(result.finishReason).toBe('tool-calls');
    });
});
