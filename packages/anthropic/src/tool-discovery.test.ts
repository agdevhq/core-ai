import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import type { RawMessageStreamEvent } from '@anthropic-ai/sdk/resources/messages/messages';
import {
    TOOL_DISCOVERY_PLACEHOLDER_TOOL_NAME,
    TOOL_DISCOVERY_TOOL_NAME,
    ToolSchemaStrictnessError,
    type GenerateOptions,
    type Message,
    type ToolSnapshot,
} from '@core-ai/core-ai';
import { toAsyncIterable } from '@core-ai/testing';
import {
    createStreamRequest,
    createStructuredOutputOptions,
    getAnthropicRequestBetas,
} from './chat-adapter.ts';
import { createAnthropicChatModel } from './chat-model.ts';
import { getAnthropicModelCapabilities } from './model-capabilities.ts';

const NATIVE_MODEL = 'claude-sonnet-4-6';
const PRE_4_5_MODEL = 'claude-sonnet-4';

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

/**
 * One step with a discovery call and a tool call, answered by a tool result
 * and a discovery result, then a call to the discovered tool.
 */
function createHistory(): Message[] {
    return [
        { role: 'user', content: 'Book a meeting about the launch' },
        {
            role: 'assistant',
            parts: [
                {
                    type: 'tool-discovery-call',
                    discoveryCall: { id: 'toolu_discover', query: 'calendar' },
                },
                {
                    type: 'tool-call',
                    toolCall: {
                        id: 'toolu_search',
                        name: 'search',
                        arguments: { query: 'launch date' },
                    },
                },
            ],
        },
        {
            role: 'tool',
            toolCallId: 'toolu_search',
            content: 'The launch is on Friday.',
        },
        {
            role: 'tool-discovery',
            discoveryCallId: 'toolu_discover',
            tools: [bookMeeting, cancelMeeting],
        },
        {
            role: 'assistant',
            parts: [
                {
                    type: 'tool-call',
                    toolCall: {
                        id: 'toolu_book',
                        name: 'book_meeting',
                        arguments: { title: 'Launch' },
                    },
                },
            ],
        },
        { role: 'tool', toolCallId: 'toolu_book', content: 'Booked.' },
    ];
}

function createRequest(
    options: Partial<GenerateOptions> = {},
    modelId = NATIVE_MODEL
) {
    return createStreamRequest(modelId, 4096, {
        messages: createHistory(),
        tools: { search: searchTool },
        toolDiscovery: {},
        ...options,
    });
}

function getToolNames(request: ReturnType<typeof createRequest>) {
    return (request.tools ?? []).map((tool) =>
        'defer_loading' in tool && tool.defer_loading
            ? `${tool.name} (deferred)`
            : tool.name
    );
}

describe('tool discovery capability', () => {
    it('is native from the 4.5 generation on and emulated before', () => {
        expect(
            getAnthropicModelCapabilities('claude-haiku-4-5').tools
                .toolDiscovery
        ).toBe('native');
        expect(
            getAnthropicModelCapabilities('claude-future-7').tools.toolDiscovery
        ).toBe('native');
        expect(
            getAnthropicModelCapabilities(PRE_4_5_MODEL).tools.toolDiscovery
        ).toBe('emulated');
    });
});

describe('native tool discovery', () => {
    it('declares caller tools and the discovery tool, then deferred tools', () => {
        expect(getToolNames(createRequest())).toEqual([
            'search',
            TOOL_DISCOVERY_TOOL_NAME,
            `${TOOL_DISCOVERY_PLACEHOLDER_TOOL_NAME} (deferred)`,
            'book_meeting (deferred)',
            'cancel_meeting (deferred)',
        ]);
    });

    it('declares the placeholder before anything is discovered', () => {
        expect(
            getToolNames(
                createRequest({
                    messages: [{ role: 'user', content: 'Book a meeting' }],
                })
            )
        ).toEqual([
            'search',
            TOOL_DISCOVERY_TOOL_NAME,
            `${TOOL_DISCOVERY_PLACEHOLDER_TOOL_NAME} (deferred)`,
        ]);
    });

    it('declares the discovered tools from their snapshots', () => {
        const tools = createRequest().tools ?? [];

        expect(tools.find((tool) => tool.name === 'book_meeting')).toEqual({
            name: 'book_meeting',
            description: 'Book a meeting',
            input_schema: bookMeeting.parameters,
            defer_loading: true,
        });
    });

    it('replays discovery calls as tool_use and answers them with tool references', () => {
        const { messages } = createRequest();

        expect(messages[1]).toEqual({
            role: 'assistant',
            content: [
                {
                    type: 'tool_use',
                    id: 'toolu_discover',
                    name: TOOL_DISCOVERY_TOOL_NAME,
                    input: { query: 'calendar' },
                },
                {
                    type: 'tool_use',
                    id: 'toolu_search',
                    name: 'search',
                    input: { query: 'launch date' },
                },
            ],
        });
        expect(messages[2]).toEqual({
            role: 'user',
            content: [
                {
                    type: 'tool_result',
                    tool_use_id: 'toolu_search',
                    content: 'The launch is on Friday.',
                },
                {
                    type: 'tool_result',
                    tool_use_id: 'toolu_discover',
                    content: [
                        { type: 'tool_reference', tool_name: 'book_meeting' },
                        { type: 'tool_reference', tool_name: 'cancel_meeting' },
                    ],
                },
            ],
        });
    });

    it('sends no whitespace-only note', () => {
        const history = createHistory();
        const discoveryResult = history[3];
        if (discoveryResult?.role !== 'tool-discovery') {
            throw new Error('unexpected history');
        }
        history[3] = { ...discoveryResult, note: '  ' };

        const { messages } = createRequest({ messages: history });

        expect(messages[2]?.content).not.toContainEqual(
            expect.objectContaining({ type: 'text' })
        );
    });

    it('enables interleaved thinking for discovery without caller tools', () => {
        expect(
            getAnthropicRequestBetas('claude-sonnet-4-5', {
                messages: [{ role: 'user', content: 'Book a meeting' }],
                reasoning: { effort: 'medium' },
                toolDiscovery: {},
            })
        ).toEqual(['interleaved-thinking-2025-05-14']);
    });

    it('answers an empty discovery with text', () => {
        const history = createHistory().slice(0, 2);
        const { messages } = createRequest({
            messages: [
                ...history,
                {
                    role: 'tool',
                    toolCallId: 'toolu_search',
                    content: 'Friday',
                },
                {
                    role: 'tool-discovery',
                    discoveryCallId: 'toolu_discover',
                    tools: [],
                    note: 'Nothing matches "calendar".',
                },
            ],
        });

        expect(messages[2]?.content).toEqual([
            {
                type: 'tool_result',
                tool_use_id: 'toolu_search',
                content: 'Friday',
            },
            {
                type: 'tool_result',
                tool_use_id: 'toolu_discover',
                content: 'Nothing matches "calendar".',
            },
        ]);
    });

    it('declares a caller tool with a discovered name once, without deferring it', () => {
        const request = createRequest({
            tools: {
                search: searchTool,
                book: {
                    ...bookMeeting,
                    description: 'Book a meeting (caller definition)',
                },
            },
        });

        expect(getToolNames(request)).toEqual([
            'search',
            'book_meeting',
            TOOL_DISCOVERY_TOOL_NAME,
            `${TOOL_DISCOVERY_PLACEHOLDER_TOOL_NAME} (deferred)`,
            'cancel_meeting (deferred)',
        ]);
        expect(request.messages[2]?.content).toContainEqual(
            expect.objectContaining({
                tool_use_id: 'toolu_discover',
                content: [
                    { type: 'tool_reference', tool_name: 'book_meeting' },
                    { type: 'tool_reference', tool_name: 'cancel_meeting' },
                ],
            })
        );
    });

    it('declares strict discovered tools strict and deferred', () => {
        const strictTool: ToolSnapshot = {
            ...bookMeeting,
            strict: true,
            parameters: {
                type: 'object',
                properties: { title: { type: 'string' } },
                required: ['title'],
            },
        };
        const history = createHistory();
        history[3] = {
            role: 'tool-discovery',
            discoveryCallId: 'toolu_discover',
            tools: [strictTool],
        };

        const tools = createRequest({ messages: history }).tools ?? [];

        expect(tools.find((tool) => tool.name === 'book_meeting')).toEqual({
            name: 'book_meeting',
            description: 'Book a meeting',
            input_schema: {
                ...strictTool.parameters,
                additionalProperties: false,
            },
            strict: true,
            defer_loading: true,
        });
    });

    it('declares discovered tools beyond the union parameter limit without strict', () => {
        const withNullables = (name: string): ToolSnapshot => ({
            name,
            description: name,
            strict: true,
            parameters: {
                type: 'object',
                properties: Object.fromEntries(
                    Array.from({ length: 9 }, (_, index) => [
                        `f${index}`,
                        { type: ['string', 'null'] },
                    ])
                ),
                required: Array.from({ length: 9 }, (_, i) => `f${i}`),
                additionalProperties: false,
            },
        });
        const history = createHistory();
        history[3] = {
            role: 'tool-discovery',
            discoveryCallId: 'toolu_discover',
            tools: [
                withNullables('alpha_record'),
                withNullables('beta_record'),
            ],
        };

        const tools = createRequest({ messages: history }).tools ?? [];

        expect(
            tools
                .filter((tool) => tool.name.endsWith('_record'))
                .map((tool) => [tool.name, 'strict' in tool])
        ).toEqual([
            ['alpha_record', true],
            ['beta_record', false],
        ]);
    });

    it('rejects strict discovered tools outside the strict contract', () => {
        const history = createHistory();
        history[3] = {
            role: 'tool-discovery',
            discoveryCallId: 'toolu_discover',
            tools: [{ ...cancelMeeting, strict: true }],
        };

        expect(() => createRequest({ messages: history })).toThrow(
            ToolSchemaStrictnessError
        );
    });
});

describe('emulated tool discovery', () => {
    it.each([
        ['a pre-4.5 model', {}, PRE_4_5_MODEL],
        [
            'the emulateToolDiscovery option',
            { providerOptions: { anthropic: { emulateToolDiscovery: true } } },
            NATIVE_MODEL,
        ],
    ] as const)(
        'declares ordinary tools for %s',
        (_label, options, modelId) => {
            const request = createRequest(options, modelId);

            expect(getToolNames(request)).toEqual([
                'search',
                TOOL_DISCOVERY_TOOL_NAME,
                'book_meeting',
                'cancel_meeting',
            ]);
            expect(request.messages[2]?.content).toContainEqual({
                type: 'tool_result',
                tool_use_id: 'toolu_discover',
                content:
                    'Discovered tools: book_meeting, cancel_meeting. You can call them now.',
            });
        }
    );

    it('keeps discovered tools declared when the request omits toolDiscovery', () => {
        const request = createRequest({ toolDiscovery: undefined });

        expect(getToolNames(request)).toEqual([
            'search',
            'book_meeting',
            'cancel_meeting',
        ]);
        expect(request.messages[1]?.content).toContainEqual(
            expect.objectContaining({
                type: 'tool_use',
                name: TOOL_DISCOVERY_TOOL_NAME,
            })
        );
    });
});

describe('cache breakpoints on discovery results', () => {
    function withCacheControl(history: Message[]): Message[] {
        return history.map((message) =>
            message.role === 'tool-discovery'
                ? {
                      ...message,
                      providerOptions: {
                          anthropic: { cacheControl: { type: 'ephemeral' } },
                      },
                  }
                : message
        );
    }

    it.each([
        ['natively', {}],
        [
            'emulated',
            { providerOptions: { anthropic: { emulateToolDiscovery: true } } },
        ],
    ] as const)('places the breakpoint on the result %s', (_label, options) => {
        const request = createRequest({
            ...options,
            messages: withCacheControl(createHistory()),
        });

        expect(request.messages[2]?.content).toContainEqual(
            expect.objectContaining({
                type: 'tool_result',
                tool_use_id: 'toolu_discover',
                cache_control: { type: 'ephemeral' },
            })
        );
    });

    it('counts the breakpoint toward the request limit', () => {
        const history = withCacheControl(createHistory()).map((message) =>
            message.role === 'tool' || message.role === 'user'
                ? {
                      ...message,
                      providerOptions: {
                          anthropic: { cacheControl: { type: 'ephemeral' } },
                      },
                  }
                : message
        ) as Message[];

        expect(() =>
            createRequest({
                messages: history,
                providerOptions: {
                    anthropic: { cacheControl: { type: 'ephemeral' } },
                },
            })
        ).toThrow(/at most 4 cache breakpoints/);
    });
});

describe('structured output after tool discovery', () => {
    it('declares no discovered tools and replays discovery as tool calls', () => {
        const request = createStreamRequest(
            NATIVE_MODEL,
            4096,
            createStructuredOutputOptions({
                messages: createHistory(),
                schema: z.object({ title: z.string() }),
            })
        );

        expect(request.tools).toBeUndefined();
        expect(request.messages[1]?.content).toContainEqual({
            type: 'tool_use',
            id: 'toolu_discover',
            name: TOOL_DISCOVERY_TOOL_NAME,
            input: { query: 'calendar' },
        });
        expect(request.messages[2]?.content).toContainEqual(
            expect.objectContaining({
                type: 'tool_result',
                tool_use_id: 'toolu_discover',
                content: expect.stringContaining(
                    'Discovered tools: book_meeting, cancel_meeting.'
                ),
            })
        );
    });
});

describe('discovery calls in responses', () => {
    const events = [
        {
            type: 'message_start',
            message: {
                id: 'msg_1',
                type: 'message',
                role: 'assistant',
                model: NATIVE_MODEL,
                content: [],
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: 10, output_tokens: 0 },
            },
        },
        {
            type: 'content_block_start',
            index: 0,
            content_block: {
                type: 'tool_use',
                id: 'toolu_discover',
                name: TOOL_DISCOVERY_TOOL_NAME,
                input: {},
            },
        },
        {
            type: 'content_block_delta',
            index: 0,
            delta: {
                type: 'input_json_delta',
                partial_json: '{"names":["book_meeting"]}',
            },
        },
        { type: 'content_block_stop', index: 0 },
        {
            type: 'message_delta',
            delta: { stop_reason: 'tool_use', stop_sequence: null },
            usage: { output_tokens: 5 },
        },
    ] as unknown as RawMessageStreamEvent[];
    const discoveryCall = { id: 'toolu_discover', names: ['book_meeting'] };

    function createModel() {
        return createAnthropicChatModel(
            {
                messages: {
                    create: async () => toAsyncIterable(events),
                },
            } as unknown as Pick<Anthropic, 'messages'>,
            NATIVE_MODEL,
            { defaultMaxTokens: 4096 }
        );
    }

    it('returns a call to the discovery tool as a discovery call', async () => {
        const result = await createModel().generate({
            messages: [{ role: 'user', content: 'Book a meeting' }],
            toolDiscovery: {},
        });

        expect(result.parts).toEqual([
            { type: 'tool-discovery-call', discoveryCall },
        ]);
        expect(result.discoveryCalls).toEqual([discoveryCall]);
        expect(result.toolCalls).toEqual([]);
        expect(result.finishReason).toBe('tool-calls');
    });

    it('streams a call to the discovery tool as one discovery call event', async () => {
        const stream = await createModel().stream({
            messages: [{ role: 'user', content: 'Book a meeting' }],
            toolDiscovery: {},
        });

        const eventTypes = (await stream.events).map((event) => event.type);
        expect(eventTypes).toContain('tool-discovery-call');
        expect(eventTypes).not.toContain('tool-call-start');
        expect(eventTypes).not.toContain('tool-call-delta');
        expect((await stream.result).discoveryCalls).toEqual([discoveryCall]);
    });
});
