import { toAsyncIterable } from '@core-ai/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationError } from './errors.ts';
import { finalizeGenerateResult } from './finalize-result.ts';
import {
    MULTIMODAL_INPUT_MODALITIES,
    UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
} from './model-capabilities.ts';
import { resultToMessage } from './result-to-message.ts';
import { createChatStream } from './stream.ts';
import { getSystemMessagePlacementIssues } from './system-message-placement.ts';
import {
    createToolDiscoveryCallPart,
    emulateToolDiscoveryMessages,
    getEmulatedToolSet,
    getToolDiscoveryResultText,
    resolveToolDiscovery,
    TOOL_DISCOVERY_PLACEHOLDER_TOOL_NAME,
    TOOL_DISCOVERY_TOOL_NAME,
} from './tool-discovery.ts';
import type {
    GenerateResult,
    Message,
    ModelCapabilities,
    StreamEvent,
    ToolSet,
    ToolSnapshot,
} from './types.ts';

function createCapabilities(
    toolDiscovery: ModelCapabilities['tools']['toolDiscovery']
): ModelCapabilities {
    return {
        reasoning: {
            mode: 'unsupported',
            supportedEfforts: [],
            restrictsSamplingParams: false,
            supportedToolChoices: ['auto', 'none', 'required', 'tool'],
        },
        modalities: MULTIMODAL_INPUT_MODALITIES,
        tools: {
            strictSchemas: UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
            toolDiscovery,
        },
        messages: { systemPlacement: 'anywhere' },
    };
}

const NATIVE = {
    capabilities: createCapabilities('native'),
    providerId: 'test',
};
const EMULATED = {
    capabilities: createCapabilities('emulated'),
    providerId: 'test',
};

function snapshot(name: string, description = `${name} tool`): ToolSnapshot {
    return {
        name,
        description,
        parameters: { type: 'object', properties: {} },
    };
}

const callerTools = {
    search: {
        name: 'search',
        description: 'Search',
        parameters: z.object({ query: z.string() }),
    },
} satisfies ToolSet;

/** A user turn, a discovery call, and its result. */
function createDiscoveryHistory(
    tools: ToolSnapshot[],
    note?: string
): Message[] {
    return [
        { role: 'user', content: 'Book a meeting' },
        {
            role: 'assistant',
            parts: [
                {
                    type: 'tool-discovery-call',
                    id: 'd1',
                    query: 'calendar',
                    providerMetadata: { google: { thoughtSignature: 'sig' } },
                },
            ],
        },
        {
            role: 'tool-discovery',
            callId: 'd1',
            tools,
            ...(note ? { note } : {}),
        },
    ];
}

const usage: GenerateResult['usage'] = {
    inputTokens: 1,
    outputTokens: 1,
    inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: 0 },
    outputTokenDetails: {},
};

describe('resolveToolDiscovery', () => {
    it('renders natively only when requested and supported', () => {
        const messages: Message[] = [{ role: 'user', content: 'hi' }];

        expect(
            resolveToolDiscovery({ messages, toolDiscovery: {} }, NATIVE)
                .rendering
        ).toBe('native');
        expect(
            resolveToolDiscovery({ messages, toolDiscovery: {} }, EMULATED)
                .rendering
        ).toBe('emulated');
        expect(
            resolveToolDiscovery(
                { messages, toolDiscovery: {} },
                { ...NATIVE, emulate: true }
            ).rendering
        ).toBe('emulated');
        expect(resolveToolDiscovery({ messages }, NATIVE).rendering).toBe(
            'emulated'
        );
    });

    it('declares the discovery tool with the appended description', () => {
        const { discoveryTool } = resolveToolDiscovery(
            {
                messages: [{ role: 'user', content: 'hi' }],
                toolDiscovery: { description: 'Discoverable: calendar_*' },
            },
            NATIVE
        );

        expect(discoveryTool?.name).toBe(TOOL_DISCOVERY_TOOL_NAME);
        expect(discoveryTool?.description).toMatch(
            /Discovers tools[\s\S]*\n\nDiscoverable: calendar_\*$/
        );
        expect(discoveryTool?.parameters).toMatchObject({
            type: 'object',
            properties: {
                names: { type: 'array' },
                query: { type: 'string' },
            },
        });
    });

    it('declares discovered tools in order of first discovery from their latest snapshot', () => {
        const messages: Message[] = [
            ...createDiscoveryHistory([snapshot('a', 'old'), snapshot('b')]),
            {
                role: 'assistant',
                parts: [
                    { type: 'tool-discovery-call', id: 'd2', names: ['a'] },
                ],
            },
            {
                role: 'tool-discovery',
                callId: 'd2',
                tools: [snapshot('c'), snapshot('a', 'new')],
            },
        ];

        const { discoveredTools } = resolveToolDiscovery(
            { messages },
            EMULATED
        );

        expect(
            discoveredTools.map((tool) => [tool.name, tool.description])
        ).toEqual([
            ['a', 'new'],
            ['b', 'b tool'],
            ['c', 'c tool'],
        ]);
    });

    it("lets the caller's definition win over a discovered tool", () => {
        const { discoveredTools } = resolveToolDiscovery(
            {
                messages: createDiscoveryHistory([
                    snapshot('search'),
                    snapshot('book'),
                ]),
                tools: callerTools,
            },
            EMULATED
        );

        expect(discoveredTools.map((tool) => tool.name)).toEqual(['book']);
    });

    it.each([TOOL_DISCOVERY_TOOL_NAME, TOOL_DISCOVERY_PLACEHOLDER_TOOL_NAME])(
        'rejects the reserved name %s for caller tools',
        (name) => {
            expect(() =>
                resolveToolDiscovery(
                    {
                        messages: [{ role: 'user', content: 'hi' }],
                        tools: { mine: { ...callerTools.search, name } },
                        toolDiscovery: {},
                    },
                    NATIVE
                )
            ).toThrow(ValidationError);
        }
    );

    it('rejects reserved names for discovered tools', () => {
        expect(() =>
            resolveToolDiscovery(
                {
                    messages: createDiscoveryHistory([
                        snapshot(TOOL_DISCOVERY_TOOL_NAME),
                    ]),
                },
                EMULATED
            )
        ).toThrow(/is reserved/);
    });

    it('ignores reserved names while discovery is not in use', () => {
        expect(() =>
            resolveToolDiscovery(
                {
                    messages: [{ role: 'user', content: 'hi' }],
                    tools: {
                        mine: {
                            ...callerTools.search,
                            name: TOOL_DISCOVERY_TOOL_NAME,
                        },
                    },
                },
                NATIVE
            )
        ).not.toThrow();
    });

    it('rejects an unanswered discovery call', () => {
        const messages = createDiscoveryHistory([]).slice(0, 2);

        expect(() => resolveToolDiscovery({ messages }, EMULATED)).toThrow(
            'Discovery call "d1" has no tool-discovery message answering it'
        );
    });

    it('rejects a discovery result without a preceding call', () => {
        const messages: Message[] = [
            { role: 'user', content: 'hi' },
            { role: 'tool-discovery', callId: 'missing', tools: [] },
        ];

        expect(() => resolveToolDiscovery({ messages }, EMULATED)).toThrow(
            /does not answer a preceding tool-discovery-call/
        );
    });

    it('rejects a discovery call answered twice', () => {
        const messages: Message[] = [
            ...createDiscoveryHistory([]),
            { role: 'tool-discovery', callId: 'd1', tools: [] },
        ];

        expect(() => resolveToolDiscovery({ messages }, EMULATED)).toThrow(
            /answered by more than one/
        );
    });

    it('rejects snapshots whose parameters are not plain JSON Schema', () => {
        const messages = createDiscoveryHistory([
            {
                name: 'book',
                description: 'Book',
                parameters: z.object(
                    {}
                ) as unknown as ToolSnapshot['parameters'],
            },
        ]);

        expect(() => resolveToolDiscovery({ messages }, EMULATED)).toThrow(
            /must have plain JSON Schema parameters/
        );
    });

    it('rejects a toolChoice that names a discovered tool', () => {
        expect(() =>
            resolveToolDiscovery(
                {
                    messages: createDiscoveryHistory([snapshot('book')]),
                    toolChoice: { type: 'tool', toolName: 'book' },
                },
                EMULATED
            )
        ).toThrow(/toolChoice may only name tools in `tools`/);
    });
});

describe('getEmulatedToolSet', () => {
    it('declares caller tools, then the discovery tool, then discovered tools', () => {
        const discovery = resolveToolDiscovery(
            {
                messages: createDiscoveryHistory([snapshot('book')]),
                tools: callerTools,
                toolDiscovery: {},
            },
            EMULATED
        );

        expect(
            Object.values(getEmulatedToolSet(callerTools, discovery) ?? {}).map(
                (tool) => tool.name
            )
        ).toEqual(['search', TOOL_DISCOVERY_TOOL_NAME, 'book']);
    });

    it('returns the caller tools unchanged without discovery', () => {
        const discovery = resolveToolDiscovery(
            { messages: [{ role: 'user', content: 'hi' }] },
            EMULATED
        );

        expect(getEmulatedToolSet(callerTools, discovery)).toBe(callerTools);
    });

    it('never overwrites a caller tool whose key matches a discovered name', () => {
        const tools = {
            book: { ...callerTools.search, name: 'search' },
        } satisfies ToolSet;
        const discovery = resolveToolDiscovery(
            { messages: createDiscoveryHistory([snapshot('book')]), tools },
            EMULATED
        );

        expect(
            Object.values(getEmulatedToolSet(tools, discovery) ?? {}).map(
                (tool) => tool.name
            )
        ).toEqual(['search', 'book']);
    });
});

describe('emulateToolDiscoveryMessages', () => {
    it('renders discovery calls and results as tool calls and text results', () => {
        expect(
            emulateToolDiscoveryMessages(
                createDiscoveryHistory(
                    [snapshot('book'), snapshot('cancel')],
                    'The CRM source is unavailable.'
                )
            ).slice(1)
        ).toEqual([
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'tool-call',
                        toolCall: {
                            id: 'd1',
                            name: TOOL_DISCOVERY_TOOL_NAME,
                            arguments: { query: 'calendar' },
                        },
                        providerMetadata: {
                            google: { thoughtSignature: 'sig' },
                        },
                    },
                ],
            },
            {
                role: 'tool',
                toolCallId: 'd1',
                content:
                    'Discovered tools: book, cancel. You can call them now.\n\nThe CRM source is unavailable.',
            },
        ]);
    });

    it('returns other messages unchanged', () => {
        const message: Message = { role: 'user', content: 'hi' };

        expect(emulateToolDiscoveryMessages([message])[0]).toBe(message);
    });
});

describe('getToolDiscoveryResultText', () => {
    it('uses the note or a default text for empty results', () => {
        expect(getToolDiscoveryResultText({ tools: [] })).toBe(
            'No matching tools were found.'
        );
        expect(
            getToolDiscoveryResultText({ tools: [], note: 'Try "crm".' })
        ).toBe('Try "crm".');
    });
});

describe('createToolDiscoveryCallPart', () => {
    it('reads names and query and drops malformed fields', () => {
        expect(
            createToolDiscoveryCallPart('d1', {
                names: ['a', 1, 'b'],
                query: 'calendar',
                extra: true,
            })
        ).toEqual({
            type: 'tool-discovery-call',
            id: 'd1',
            names: ['a', 'b'],
            query: 'calendar',
        });
        expect(
            createToolDiscoveryCallPart('d2', { names: 'a', query: 3 })
        ).toEqual({ type: 'tool-discovery-call', id: 'd2', names: ['a'] });
        expect(createToolDiscoveryCallPart('d3', null)).toEqual({
            type: 'tool-discovery-call',
            id: 'd3',
        });
    });
});

describe('finalizeGenerateResult with tool discovery', () => {
    const discoveryCall = {
        id: 'd1',
        name: TOOL_DISCOVERY_TOOL_NAME,
        arguments: { names: ['book'] },
    };
    const searchCall = { id: 't1', name: 'search', arguments: { query: 'x' } };
    const result: GenerateResult = {
        parts: [
            { type: 'tool-call', toolCall: discoveryCall },
            { type: 'tool-call', toolCall: searchCall },
        ],
        content: null,
        reasoning: null,
        toolCalls: [discoveryCall, searchCall],
        finishReason: 'tool-calls',
        usage,
    };

    it('turns discovery tool calls into discovery parts', () => {
        const finalized = finalizeGenerateResult(result, {
            toolDiscovery: {},
        });

        expect(finalized.parts[0]).toEqual({
            type: 'tool-discovery-call',
            id: 'd1',
            names: ['book'],
        });
        expect(finalized.toolCalls.map((call) => call.id)).toEqual(['t1']);
        expect(finalized.finishReason).toBe('tool-calls');
        expect(resultToMessage(finalized).parts[0]).toEqual(finalized.parts[0]);
    });

    it('leaves the calls alone when the request does not use discovery', () => {
        const finalized = finalizeGenerateResult(result, {});

        expect(finalized.toolCalls).toHaveLength(2);
    });
});

describe('createChatStream with tool discovery', () => {
    it('streams a discovery call as one tool-discovery-call event', async () => {
        const events: StreamEvent[] = [
            { type: 'text-start' },
            { type: 'text-delta', text: 'Looking' },
            {
                type: 'tool-call-start',
                toolCallId: 'd1',
                toolName: TOOL_DISCOVERY_TOOL_NAME,
            },
            {
                type: 'tool-call-delta',
                toolCallId: 'd1',
                argumentsDelta: '{"query":"calendar"}',
            },
            {
                type: 'tool-call-end',
                toolCall: {
                    id: 'd1',
                    name: TOOL_DISCOVERY_TOOL_NAME,
                    arguments: { query: 'calendar' },
                },
                providerMetadata: { google: { thoughtSignature: 'sig' } },
            },
            { type: 'finish', finishReason: 'tool-calls', usage },
        ];

        const stream = createChatStream(toAsyncIterable(events), {
            request: { toolDiscovery: {} },
        });
        const result = await stream.result;

        expect((await stream.events).map((event) => event.type)).toEqual([
            'text-start',
            'text-delta',
            'tool-discovery-call',
            'finish',
        ]);
        expect(result.parts).toEqual([
            { type: 'text', text: 'Looking' },
            {
                type: 'tool-discovery-call',
                id: 'd1',
                query: 'calendar',
                providerMetadata: { google: { thoughtSignature: 'sig' } },
            },
        ]);
        expect(result.toolCalls).toEqual([]);
        expect(result.finishReason).toBe('tool-calls');
    });

    it('aggregates discovery calls emitted by native adapters', async () => {
        const stream = createChatStream(
            toAsyncIterable<StreamEvent>([
                { type: 'tool-discovery-call', id: 'd1', names: ['book'] },
                { type: 'finish', finishReason: 'tool-calls', usage },
            ])
        );

        expect((await stream.result).parts).toEqual([
            { type: 'tool-discovery-call', id: 'd1', names: ['book'] },
        ]);
    });
});

describe('system message placement', () => {
    it('treats a discovery result like a tool result', () => {
        expect(
            getSystemMessagePlacementIssues(
                [
                    ...createDiscoveryHistory([]),
                    { role: 'system', content: 'Be brief.' },
                ],
                'before-reply'
            )
        ).toEqual([]);
    });
});
