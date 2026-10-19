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
    ToolSchemaStrictnessError,
    ValidationError,
    type GenerateOptions,
    type Message,
    type StreamEvent,
    type ToolSnapshot,
} from '@core-ai/core-ai';
import { toAsyncIterable } from '@core-ai/testing';
import {
    createGenerateRequest,
    mapGenerateResponse,
    transformStream,
} from './chat-adapter.ts';
import { createOpenAIChatCompletionsModel } from './chat-completions/chat-model.ts';
import { createOpenAIChatModel } from './chat-model.ts';
import {
    getOpenAIModelCapabilities,
    toOpenAIResponsesCapabilities,
} from './model-capabilities.ts';
import {
    createStructuredOutputRequestOptions,
    type OpenAIStructuredOutputMode,
} from './shared/structured-output.ts';

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

function createHistory(): Message[] {
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
            messages: createHistory(),
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

    it('renders discovery calls and results as tool search items', () => {
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
            expect.objectContaining({
                type: 'function_call',
                call_id: 'call_book',
            }),
        ]);
    });

    it('renders each output as stored, so a refresh leaves earlier outputs unchanged', () => {
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

        const { input } = createRequest({ messages: history });
        const before = createRequest({ messages: createHistory() }).input;

        expect(input.slice(0, before.length)).toEqual(before);
        expect(
            input
                .filter((item) => item.type === 'tool_search_output')
                .map((output) => output.tools)
        ).toEqual([
            [
                expect.objectContaining({
                    name: 'book_meeting',
                    description: bookMeeting.description,
                }),
                expect.objectContaining({ name: 'cancel_meeting' }),
            ],
            [
                expect.objectContaining({
                    name: 'book_meeting',
                    description: 'Book a meeting v2',
                }),
            ],
        ]);
    });

    it('drops strict from every rendering of a tool whose latest snapshot is not strict', () => {
        const strictBook: ToolSnapshot = {
            ...bookMeeting,
            strict: true,
            parameters: {
                type: 'object',
                properties: { title: { type: 'string' } },
                required: ['title'],
                additionalProperties: false,
            },
        };
        const history: Message[] = [
            { role: 'user', content: 'Book a meeting' },
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'tool-discovery-call',
                        discoveryCall: {
                            id: 'call_1',
                            names: ['book_meeting'],
                        },
                    },
                ],
            },
            {
                role: 'tool-discovery',
                discoveryCallId: 'call_1',
                tools: [strictBook],
            },
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'tool-discovery-call',
                        discoveryCall: {
                            id: 'call_2',
                            names: ['book_meeting'],
                        },
                    },
                ],
            },
            {
                role: 'tool-discovery',
                discoveryCallId: 'call_2',
                tools: [{ ...strictBook, strict: false }],
            },
        ];

        const outputs = createRequest({ messages: history }).input.filter(
            (item) => item.type === 'tool_search_output'
        );

        expect(outputs.map((output) => output.tools)).toEqual([
            [expect.objectContaining({ name: 'book_meeting', strict: false })],
            [expect.objectContaining({ name: 'book_meeting', strict: false })],
        ]);
    });

    it('sends the note of an empty result as a developer message after the step', () => {
        const history = createHistory();
        history[2] = {
            role: 'tool-discovery',
            discoveryCallId: 'call_discover',
            tools: [],
            note: 'The CRM source is unavailable.',
        };

        const { input } = createRequest({ messages: history.slice(0, 4) });

        expect(input.slice(3)).toEqual([
            expect.objectContaining({ type: 'tool_search_output', tools: [] }),
            expect.objectContaining({ type: 'function_call_output' }),
            {
                role: 'developer',
                content: [
                    {
                        type: 'input_text',
                        text: 'The CRM source is unavailable.',
                    },
                ],
            },
        ]);
    });

    it('sends nothing more for an empty result without a note', () => {
        const history = createHistory();
        history[2] = {
            role: 'tool-discovery',
            discoveryCallId: 'call_discover',
            tools: [],
        };

        const { input } = createRequest({ messages: history.slice(0, 4) });

        expect(input.at(-1)).toEqual(
            expect.objectContaining({ type: 'function_call_output' })
        );
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

        expect(input.find((item) => item.call_id === 'call_book')).toEqual({
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

    it('rejects strict discovered tools outside the strict contract', () => {
        const history = createHistory();
        history[2] = {
            role: 'tool-discovery',
            discoveryCallId: 'call_discover',
            tools: [
                {
                    ...bookMeeting,
                    parameters: {
                        ...bookMeeting.parameters,
                        properties: { title: { type: 'string', minLength: 1 } },
                    },
                    strict: true,
                },
            ],
        };

        expect(() => createRequest({ messages: history })).toThrow(
            ToolSchemaStrictnessError
        );
    });

    it('sends no whitespace-only note', () => {
        const history = createHistory();
        history[2] = {
            role: 'tool-discovery',
            discoveryCallId: 'call_discover',
            tools: [],
            note: '  ',
        };

        const { input } = createRequest({ messages: history });

        expect(input).not.toContainEqual(
            expect.objectContaining({ role: 'developer' })
        );
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
                    output: 'Discovered tools: book_meeting, search, cancel_meeting. You can call them now.',
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

describe('discovery calls through the models', () => {
    const discoveryCall = { id: 'call_d', names: ['book_meeting'] };
    const arguments_ = '{"names":["book_meeting"]}';
    const functionCall = {
        type: 'function_call',
        id: 'fc_1',
        call_id: 'call_d',
        name: TOOL_DISCOVERY_TOOL_NAME,
        arguments: arguments_,
        status: 'completed',
    };
    const messages: Message[] = [{ role: 'user', content: 'Book a meeting' }];

    function createResponsesModel(create: () => Promise<unknown>) {
        return createOpenAIChatModel(
            { responses: { create } } as unknown as Pick<OpenAI, 'responses'>,
            EMULATED_MODEL,
            toOpenAIResponsesCapabilities(
                getOpenAIModelCapabilities(EMULATED_MODEL)
            )
        );
    }

    function expectOneDiscoveryEvent(events: readonly StreamEvent[]) {
        const types = events.map((event) => event.type);
        expect(
            types.filter((type) => type === 'tool-discovery-call')
        ).toHaveLength(1);
        expect(types).not.toContain('tool-call-start');
        expect(types).not.toContain('tool-call-delta');
    }

    it('returns emulated Responses discovery calls as discovery calls', async () => {
        const model = createResponsesModel(async () => ({
            status: 'completed',
            output: [functionCall],
        }));

        const result = await model.generate({ messages, toolDiscovery: {} });

        expect(result.discoveryCalls).toEqual([discoveryCall]);
        expect(result.toolCalls).toEqual([]);
        expect(result.finishReason).toBe('tool-calls');
    });

    it('streams emulated Responses discovery calls as one event', async () => {
        const model = createResponsesModel(async () =>
            toAsyncIterable([
                {
                    type: 'response.output_item.added',
                    output_index: 0,
                    item: { ...functionCall, arguments: '' },
                },
                {
                    type: 'response.function_call_arguments.delta',
                    output_index: 0,
                    item_id: 'fc_1',
                    delta: arguments_,
                },
                {
                    type: 'response.output_item.done',
                    output_index: 0,
                    item: functionCall,
                },
                {
                    type: 'response.completed',
                    response: { status: 'completed', output: [functionCall] },
                },
            ])
        );

        const stream = await model.stream({ messages, toolDiscovery: {} });

        expectOneDiscoveryEvent(await stream.events);
        expect((await stream.result).discoveryCalls).toEqual([discoveryCall]);
    });

    it('streams Chat Completions discovery calls as one event', async () => {
        const model = createOpenAIChatCompletionsModel(
            {
                chat: {
                    completions: {
                        create: async () =>
                            toAsyncIterable([
                                {
                                    choices: [
                                        {
                                            index: 0,
                                            finish_reason: null,
                                            delta: {
                                                tool_calls: [
                                                    {
                                                        index: 0,
                                                        id: 'call_d',
                                                        type: 'function',
                                                        function: {
                                                            name: TOOL_DISCOVERY_TOOL_NAME,
                                                            arguments:
                                                                arguments_,
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                    ],
                                },
                                {
                                    choices: [
                                        {
                                            index: 0,
                                            finish_reason: 'tool_calls',
                                            delta: {},
                                        },
                                    ],
                                },
                            ]),
                    },
                } as unknown as OpenAI['chat'],
            },
            NATIVE_MODEL,
            { capabilities: getOpenAIModelCapabilities(NATIVE_MODEL) }
        );

        const stream = await model.stream({ messages, toolDiscovery: {} });

        expectOneDiscoveryEvent(await stream.events);
        expect((await stream.result).discoveryCalls).toEqual([discoveryCall]);
    });
});

describe('structured output after tool discovery', () => {
    const schema = z.object({ title: z.string() });

    it.each(['json-schema', 'tool', 'json-object'] as const)(
        'declares no discovered tools in %s mode',
        (mode: OpenAIStructuredOutputMode) => {
            const request = createGenerateRequest(
                NATIVE_MODEL,
                createStructuredOutputRequestOptions(
                    { messages: createHistory(), schema },
                    'openai',
                    mode
                ),
                {
                    capabilities: toOpenAIResponsesCapabilities(
                        getOpenAIModelCapabilities(NATIVE_MODEL)
                    ),
                }
            ) as unknown as {
                tools?: { name: string }[];
                input: Record<string, unknown>[];
            };

            expect((request.tools ?? []).map((tool) => tool.name)).toEqual(
                mode === 'tool' ? ['core_ai_generate_object'] : []
            );
            expect(request.input).toContainEqual(
                expect.objectContaining({
                    type: 'function_call',
                    name: TOOL_DISCOVERY_TOOL_NAME,
                })
            );
        }
    );

    it('rejects an unanswered discovery call', () => {
        expect(() =>
            createStructuredOutputRequestOptions(
                { messages: createHistory().slice(0, 2), schema },
                'openai'
            )
        ).toThrow(ValidationError);
    });
});
