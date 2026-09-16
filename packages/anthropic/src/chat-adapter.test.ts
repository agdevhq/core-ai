import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    ToolSchemaStrictnessError,
    ValidationError,
    defineTool,
    type GenerateOptions,
    type Message,
    type ToolSet,
    TEXT_ONLY_MODALITIES,
} from '@core-ai/core-ai';
import type {
    Message as AnthropicMessage,
    RawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/messages/messages';
import {
    createGenerateRequest,
    createStreamRequest,
    createStructuredOutputOptions,
    convertMessages,
    convertToolChoice,
    convertTools,
    getAnthropicRequestBetas,
    mapGenerateResponse,
    transformStream,
} from './chat-adapter.js';
import { getAnthropicModelCapabilities } from './model-capabilities.js';
import { toAsyncIterable } from '@core-ai/testing';

describe('convertMessages', () => {
    it('should extract system messages separately', () => {
        const messages: Message[] = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
        ];

        const result = convertMessages(messages);

        expect(result.system).toBe('You are helpful.');
        expect(result.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('should concatenate multiple system messages', () => {
        const messages: Message[] = [
            { role: 'system', content: 'Rule 1.' },
            { role: 'system', content: 'Rule 2.' },
            { role: 'user', content: 'Hi' },
        ];

        const result = convertMessages(messages);

        expect(result.system).toBe('Rule 1.\nRule 2.');
    });

    it('should ignore system message metadata', () => {
        const messages: Message[] = [
            {
                role: 'system',
                content: 'You are helpful.',
                metadata: { classification: 'public' },
            },
            { role: 'user', content: 'Hello' },
        ];

        const result = convertMessages(messages);

        expect(result.system).toBe('You are helpful.');
        expect(result.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('should convert user image and pdf content', () => {
        const messages: Message[] = [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: 'Analyze these files',
                        metadata: { classification: 'public' },
                    },
                    {
                        type: 'image',
                        source: {
                            type: 'url',
                            url: 'https://example.com/photo.jpg',
                        },
                    },
                    {
                        type: 'file',
                        data: 'base64-pdf-data',
                        mimeType: 'application/pdf',
                    },
                ],
            },
        ];

        const result = convertMessages(messages);

        expect(result.messages).toEqual([
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Analyze these files' },
                    {
                        type: 'image',
                        source: {
                            type: 'url',
                            url: 'https://example.com/photo.jpg',
                        },
                    },
                    {
                        type: 'document',
                        source: {
                            type: 'base64',
                            media_type: 'application/pdf',
                            data: 'base64-pdf-data',
                        },
                    },
                ],
            },
        ]);
    });

    it('should convert assistant tool calls to tool_use blocks', () => {
        const messages: Message[] = [
            { role: 'user', content: 'weather?' },
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'tool-call',
                        toolCall: {
                            id: 'tc_1',
                            name: 'search',
                            arguments: { query: 'weather' },
                            metadata: { transformed: true },
                        },
                    },
                ],
            },
        ];

        const result = convertMessages(messages);

        expect(result.messages[1]).toEqual({
            role: 'assistant',
            content: [
                {
                    type: 'tool_use',
                    id: 'tc_1',
                    name: 'search',
                    input: { query: 'weather' },
                },
            ],
        });
    });

    it('should convert tool results to user messages with tool_result blocks', () => {
        const messages: Message[] = [
            { role: 'user', content: 'weather?' },
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'tool-call',
                        toolCall: {
                            id: 'tc_1',
                            name: 'search',
                            arguments: { query: 'weather' },
                            metadata: { transformed: true },
                        },
                    },
                ],
            },
            {
                role: 'tool',
                toolCallId: 'tc_1',
                content: 'Sunny',
                metadata: { validated: true },
            },
        ];

        const result = convertMessages(messages);

        expect(result.messages[2]).toEqual({
            role: 'user',
            content: [
                {
                    type: 'tool_result',
                    tool_use_id: 'tc_1',
                    content: 'Sunny',
                },
            ],
        });
    });

    it('should merge consecutive tool results into one user message', () => {
        const messages: Message[] = [
            { role: 'user', content: 'do both' },
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'tool-call',
                        toolCall: { id: 'tc_1', name: 'a', arguments: {} },
                    },
                    {
                        type: 'tool-call',
                        toolCall: { id: 'tc_2', name: 'b', arguments: {} },
                    },
                ],
            },
            { role: 'tool', toolCallId: 'tc_1', content: 'result1' },
            { role: 'tool', toolCallId: 'tc_2', content: 'result2' },
        ];

        const result = convertMessages(messages);

        expect(result.messages[2]).toEqual({
            role: 'user',
            content: [
                {
                    type: 'tool_result',
                    tool_use_id: 'tc_1',
                    content: 'result1',
                },
                {
                    type: 'tool_result',
                    tool_use_id: 'tc_2',
                    content: 'result2',
                },
            ],
        });
        expect(result.messages).toHaveLength(3);
    });
});

describe('convertTools', () => {
    it('should convert tools to Anthropic format', () => {
        const tools: ToolSet = {
            search: defineTool({
                name: 'search',
                description: 'Search the web',
                parameters: z.object({ query: z.string() }),
            }),
        };

        const result = convertTools(tools);

        expect(result[0]?.name).toBe('search');
        expect(result[0]?.description).toBe('Search the web');
        expect(result[0]?.strict).toBeUndefined();
        expect(result[0]?.input_schema).toMatchObject({
            type: 'object',
            properties: {
                query: { type: 'string' },
            },
        });
        expect(result[0]?.input_schema).not.toHaveProperty(
            'additionalProperties'
        );
    });

    it('should mark only explicitly strict tools as strict', () => {
        const tools: ToolSet = {
            internal: defineTool({
                name: 'internal',
                description: 'Internal tool',
                parameters: z.object({ id: z.string() }),
                strict: true,
            }),
            external: defineTool({
                name: 'external',
                description: 'External MCP tool',
                parameters: z.object({ query: z.string() }),
                strict: false,
            }),
            unset: defineTool({
                name: 'unset',
                description: 'No strict flag',
                parameters: z.object({ value: z.string() }),
            }),
        };

        const result = convertTools(tools);
        expect(result.find((tool) => tool.name === 'internal')?.strict).toBe(
            true
        );
        expect(
            result.find((tool) => tool.name === 'external')?.strict
        ).toBeUndefined();
        expect(
            result.find((tool) => tool.name === 'unset')?.strict
        ).toBeUndefined();
    });

    it('should rewrite discriminated unions from oneOf to anyOf', () => {
        const tools: ToolSet = {
            act: defineTool({
                name: 'act',
                description: 'Perform an action',
                parameters: z.object({
                    action: z.discriminatedUnion('kind', [
                        z.object({ kind: z.literal('open'), path: z.string() }),
                        z.object({ kind: z.literal('close') }),
                    ]),
                }),
                strict: true,
            }),
        };

        const action = (
            convertTools(tools)[0]?.input_schema as {
                properties: { action: Record<string, unknown> };
            }
        ).properties.action;

        expect(action).not.toHaveProperty('oneOf');
        expect(action['anyOf']).toHaveLength(2);
        for (const branch of action['anyOf'] as Array<
            Record<string, unknown>
        >) {
            expect(branch).toMatchObject({ additionalProperties: false });
        }
    });

    it('should normalize strict tool schemas and leave non-strict ones raw', () => {
        const parameters = z.object({
            value: z.string().min(3),
            count: z.int().max(10),
        });
        const tools: ToolSet = {
            strict: defineTool({
                name: 'strict',
                description: 'Strict tool',
                parameters,
                strict: true,
            }),
            nonStrict: defineTool({
                name: 'non-strict',
                description: 'Non-strict tool',
                parameters,
                strict: false,
            }),
        };

        const result = convertTools(tools);
        const strictSchema = result.find(
            (tool) => tool.name === 'strict'
        )?.input_schema;
        const nonStrictSchema = result.find(
            (tool) => tool.name === 'non-strict'
        )?.input_schema;

        expect(strictSchema).not.toHaveProperty('$schema');
        expect(strictSchema).toHaveProperty('additionalProperties', false);
        expect(strictSchema).not.toHaveProperty('properties.value.minLength');
        expect(strictSchema).not.toHaveProperty('properties.count.maximum');

        expect(nonStrictSchema).toHaveProperty('$schema');
        expect(nonStrictSchema).not.toHaveProperty('additionalProperties');
        expect(nonStrictSchema).toHaveProperty('properties.value.minLength', 3);
        expect(nonStrictSchema).toHaveProperty('properties.count.maximum', 10);
    });
});

describe('strict tool validation', () => {
    const messages = [{ role: 'user' as const, content: 'Use a tool' }];

    it('should never mark tools strict without a per-tool opt-in', () => {
        const tools = createTools(1);

        const request = createGenerateRequest('claude-sonnet-4-6', 4096, {
            messages,
            tools,
        });

        expect(request.tools?.[0]).not.toHaveProperty('strict');
    });

    it('should reject explicit strictness for known-unsupported models', () => {
        const tools = createTools(1, true);

        for (const modelId of ['claude-sonnet-4', 'claude-3-5-sonnet']) {
            expect(() =>
                createGenerateRequest(modelId, 4096, { messages, tools })
            ).toThrowError(ToolSchemaStrictnessError);
        }
    });

    it('should forward explicit strictness for unknown and future models', () => {
        const tools = createTools(1, true);

        const request = createGenerateRequest('claude-future-6', 4096, {
            messages,
            tools,
        });

        expect(request.tools?.[0]).toHaveProperty('strict', true);
    });

    it('should allow 20 strict tools and reject 21', () => {
        expect(() =>
            createGenerateRequest('claude-sonnet-4-6', 4096, {
                messages,
                tools: createTools(20, true),
            })
        ).not.toThrow();

        expect(() =>
            createGenerateRequest('claude-sonnet-4-6', 4096, {
                messages,
                tools: createTools(21, true),
            })
        ).toThrowError(/supports at most 20 strict tools/);
    });

    it('should not count plain tools toward the strict tool limit', () => {
        expect(() =>
            createGenerateRequest('claude-sonnet-4-6', 4096, {
                messages,
                tools: createTools(25),
            })
        ).not.toThrow();
    });
});

describe('convertToolChoice', () => {
    it('should convert auto and none', () => {
        expect(convertToolChoice('auto')).toEqual({ type: 'auto' });
        expect(convertToolChoice('none')).toEqual({ type: 'none' });
    });

    it('should convert required to any', () => {
        expect(convertToolChoice('required')).toEqual({ type: 'any' });
    });

    it('should convert specific tool choice', () => {
        expect(
            convertToolChoice({
                type: 'tool',
                toolName: 'search',
            })
        ).toEqual({
            type: 'tool',
            name: 'search',
        });
    });
});

describe('image input', () => {
    const messages: Message[] = [
        {
            role: 'user',
            content: [
                {
                    type: 'image',
                    source: {
                        type: 'url',
                        url: 'https://example.com/photo.jpg',
                    },
                },
            ],
        },
    ];

    it('should honor capabilities supplied by a wrapping provider', () => {
        const textOnly = {
            ...getAnthropicModelCapabilities('claude-sonnet-4-6'),
            modalities: TEXT_ONLY_MODALITIES,
        };

        expect(() =>
            createGenerateRequest(
                'claude-sonnet-4-6',
                4096,
                { messages },
                'anthropic',
                { capabilities: textOnly }
            )
        ).toThrowError(ValidationError);
    });

    it('should reject audio before converting it as a document', () => {
        const audioMessages: Message[] = [
            {
                role: 'user',
                content: [
                    {
                        type: 'audio',
                        source: {
                            type: 'base64',
                            mediaType: 'audio/wav',
                            data: 'base64-audio',
                        },
                    },
                ],
            },
        ];

        expect(() =>
            createGenerateRequest(
                'claude-sonnet-4-6',
                4096,
                { messages: audioMessages },
                'anthropic'
            )
        ).toThrowError(/input modality: audio/);
    });
});

describe('structured output helpers', () => {
    it('should create output_config-based options for structured output', () => {
        const schema = z.object({
            city: z.string(),
            temperatureC: z.number(),
        });

        const result = createStructuredOutputOptions({
            messages: [{ role: 'user', content: 'Return weather as JSON' }],
            schema,
            schemaName: 'weather_schema',
            schemaDescription: 'Structured weather output',
            maxTokens: 256,
        });

        expect(result.toolChoice).toBeUndefined();
        expect(result.tools).toBeUndefined();
        expect(result.providerOptions).toMatchObject({
            anthropic: {
                outputConfig: {
                    format: {
                        type: 'json_schema',
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                        },
                    },
                },
            },
        });
    });
});

describe('reasoning support', () => {
    it('should reconstruct thinking and redacted thinking parts in assistant messages', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'reasoning',
                        text: 'thought',
                        metadata: { internal: true },
                        providerMetadata: {
                            anthropic: { signature: 'sig_123' },
                        },
                    },
                    {
                        type: 'reasoning',
                        text: '',
                        providerMetadata: {
                            anthropic: { signature: 'sig_omitted' },
                        },
                    },
                    {
                        type: 'reasoning',
                        text: '',
                        providerMetadata: {
                            anthropic: { redactedData: 'redacted_payload' },
                        },
                    },
                    {
                        type: 'text',
                        text: 'answer',
                    },
                ],
            },
        ];

        const result = convertMessages(messages);
        expect(result.messages).toEqual([
            {
                role: 'assistant',
                content: [
                    {
                        type: 'thinking',
                        thinking: 'thought',
                        signature: 'sig_123',
                    },
                    {
                        type: 'thinking',
                        thinking: '',
                        signature: 'sig_omitted',
                    },
                    {
                        type: 'redacted_thinking',
                        data: 'redacted_payload',
                    },
                    {
                        type: 'text',
                        text: 'answer',
                    },
                ],
            },
        ]);
    });

    it('should wrap cross-provider reasoning in <thinking> tags', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'reasoning',
                        text: 'step-by-step thought',
                        providerMetadata: {
                            openai: { encryptedContent: 'enc_123' },
                        },
                    },
                    { type: 'text', text: 'answer' },
                ],
            },
        ];

        const result = convertMessages(messages);
        expect(result.messages).toEqual([
            {
                role: 'assistant',
                content: [
                    {
                        type: 'text',
                        text: '<thinking>step-by-step thought</thinking>',
                    },
                    { type: 'text', text: 'answer' },
                ],
            },
        ]);
    });

    it('should map adaptive and manual reasoning fields', () => {
        const adaptiveOptions = {
            messages: [{ role: 'user', content: 'Hi' }],
            tools: {
                tool: defineTool({
                    name: 'tool',
                    description: 'Test tool',
                    parameters: z.object({ query: z.string() }),
                }),
            },
            reasoning: { effort: 'max' },
        } satisfies GenerateOptions;
        const adaptive = createGenerateRequest(
            'claude-opus-4-6',
            4096,
            adaptiveOptions
        );

        expect(adaptive).toMatchObject({
            thinking: { type: 'adaptive', display: 'summarized' },
            output_config: { effort: 'max' },
        });
        expect(
            getAnthropicRequestBetas('claude-opus-4-6', adaptiveOptions)
        ).toEqual([]);

        const manualOptions = {
            messages: [{ role: 'user', content: 'Hi' }],
            tools: adaptiveOptions.tools,
            reasoning: { effort: 'medium' },
        } satisfies GenerateOptions;
        const manual = createGenerateRequest(
            'claude-sonnet-4-5',
            4096,
            manualOptions
        );
        expect(manual).toMatchObject({
            thinking: {
                type: 'enabled',
                budget_tokens: 8192,
                display: 'summarized',
            },
            // Interleaved thinking can spend its cumulative budget across
            // multiple blocks without increasing the per-response allowance.
            max_tokens: 4096,
        });
        expect(manual).not.toHaveProperty('betas');
        expect(
            getAnthropicRequestBetas('claude-sonnet-4-5', manualOptions)
        ).toEqual(['interleaved-thinking-2025-05-14']);

        const clamped = createGenerateRequest('claude-future-5', 4096, {
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'max' },
        });
        expect(clamped).toHaveProperty('output_config.effort', 'high');
    });
});

describe('reasoning output budgets', () => {
    const reasoningOptions = (
        effort: 'medium' | 'high' | 'max',
        maxTokens?: number
    ) =>
        ({
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort },
            ...(maxTokens === undefined ? {} : { maxTokens }),
        }) satisfies GenerateOptions;

    it('should size an omitted limit from the thinking budget', () => {
        const request = createGenerateRequest(
            'claude-sonnet-4-5',
            4096,
            reasoningOptions('high')
        );

        expect(request).toMatchObject({
            thinking: { type: 'enabled', budget_tokens: 32_768 },
            max_tokens: 36_864,
        });
    });

    it('should cap an omitted limit at the model output ceiling', () => {
        const request = createGenerateRequest(
            'claude-sonnet-4-5',
            64_000,
            reasoningOptions('high')
        );

        expect(request).toMatchObject({
            thinking: { type: 'enabled', budget_tokens: 32_768 },
            max_tokens: 64_000,
        });
    });

    it('should reject an explicit limit that cannot hold the thinking budget', () => {
        expect(() =>
            createGenerateRequest(
                'claude-sonnet-4-5',
                4096,
                reasoningOptions('high', 32_000)
            )
        ).toThrowError(
            /needs maxTokens above the 32768-token thinking budget of reasoning effort "high", but maxTokens is 32000/
        );
        expect(() =>
            createGenerateRequest(
                'claude-sonnet-4-5',
                4096,
                reasoningOptions('high', 32_000)
            )
        ).toThrowError(ValidationError);
    });

    it('should keep an explicit limit that can hold the thinking budget', () => {
        const request = createGenerateRequest(
            'claude-sonnet-4-5',
            4096,
            reasoningOptions('high', 40_000)
        );

        expect(request).toMatchObject({
            thinking: { type: 'enabled', budget_tokens: 32_768 },
            max_tokens: 40_000,
        });
    });

    it('should reject manual effort that cannot fit under the ceiling', () => {
        expect(() =>
            createGenerateRequest(
                'claude-sonnet-4-5',
                4096,
                reasoningOptions('max')
            )
        ).toThrowError(
            /cannot run reasoning effort "max": a 65536-token thinking budget does not fit under its 64000-token output ceiling/
        );
    });

    it('should honour manual max effort when the ceiling has room', () => {
        const capabilities = {
            ...getAnthropicModelCapabilities('claude-sonnet-4-5'),
            output: { maxTokens: 128_000 },
            reasoning: {
                ...getAnthropicModelCapabilities('claude-sonnet-4-5').reasoning,
                supportedEfforts: ['medium', 'high', 'max'] as const,
            },
        };

        const request = createGenerateRequest(
            'claude-sonnet-4-5',
            4096,
            reasoningOptions('max'),
            'anthropic',
            { capabilities }
        );

        expect(request).toMatchObject({
            thinking: { type: 'enabled', budget_tokens: 65_536 },
            max_tokens: 69_632,
        });
    });

    it('should reject an effort the model output ceiling cannot honour', () => {
        const base = getAnthropicModelCapabilities('claude-sonnet-4-5');
        const capabilities = {
            ...base,
            output: { maxTokens: 2000 },
            reasoning: {
                ...base.reasoning,
                supportedEfforts: ['high'] as const,
            },
        };

        expect(() =>
            createGenerateRequest(
                'claude-sonnet-4-5',
                4096,
                reasoningOptions('high'),
                'anthropic',
                { capabilities }
            )
        ).toThrowError(
            /cannot run reasoning effort "high": a 32768-token thinking budget does not fit under its 2000-token output ceiling/
        );
    });

    it('should allow interleaved thinking budget above an explicit limit', () => {
        const request = createGenerateRequest('claude-sonnet-4-5', 4096, {
            ...reasoningOptions('high', 4096),
            tools: {
                tool: defineTool({
                    name: 'tool',
                    description: 'Test tool',
                    parameters: z.object({ query: z.string() }),
                }),
            },
        });

        expect(request).toMatchObject({
            thinking: { type: 'enabled', budget_tokens: 32_768 },
            max_tokens: 4096,
        });
    });

    it('should preserve interleaved max effort above the model output ceiling', () => {
        const request = createGenerateRequest('claude-sonnet-4-5', 4096, {
            ...reasoningOptions('max'),
            tools: {
                tool: defineTool({
                    name: 'tool',
                    description: 'Test tool',
                    parameters: z.object({ query: z.string() }),
                }),
            },
        });

        expect(request).toMatchObject({
            thinking: { type: 'enabled', budget_tokens: 65_536 },
            max_tokens: 4096,
        });
    });

    it('should enforce the limit when tools do not enable interleaving', () => {
        const options = {
            ...reasoningOptions('high', 4096),
            tools: {
                tool: defineTool({
                    name: 'tool',
                    description: 'Test tool',
                    parameters: z.object({ query: z.string() }),
                }),
            },
        } satisfies GenerateOptions;

        expect(() =>
            createGenerateRequest('claude-haiku-4-5', 4096, options)
        ).toThrowError(/needs maxTokens above the 32768-token thinking budget/);
        expect(getAnthropicRequestBetas('claude-haiku-4-5', options)).toEqual(
            []
        );
    });

    it('should give adaptive max effort the full model output range', () => {
        const request = createGenerateRequest(
            'claude-opus-4-6',
            4096,
            reasoningOptions('max')
        );

        expect(request).toMatchObject({
            output_config: { effort: 'max' },
            max_tokens: 128_000,
        });
    });

    it('should leave lower adaptive efforts on the default allowance', () => {
        const request = createGenerateRequest(
            'claude-opus-4-6',
            4096,
            reasoningOptions('high')
        );

        expect(request).toMatchObject({
            output_config: { effort: 'high' },
            max_tokens: 4096,
        });
    });

    it('should respect an explicit limit for adaptive thinking', () => {
        const request = createGenerateRequest(
            'claude-opus-4-6',
            4096,
            reasoningOptions('max', 8192)
        );

        expect(request).toMatchObject({
            output_config: { effort: 'max' },
            max_tokens: 8192,
        });
    });

    it('should size stream requests the same way', () => {
        const request = createStreamRequest(
            'claude-sonnet-4-5',
            4096,
            reasoningOptions('high')
        );

        expect(request).toMatchObject({
            stream: true,
            thinking: { type: 'enabled', budget_tokens: 32_768 },
            max_tokens: 36_864,
        });
    });

    it('should leave non-reasoning requests on the caller limits', () => {
        const messages = [{ role: 'user', content: 'Hi' }] satisfies Message[];

        expect(
            createGenerateRequest('claude-sonnet-4-5', 4096, { messages })
        ).toMatchObject({ max_tokens: 4096 });
        expect(
            createGenerateRequest('claude-sonnet-4-5', 4096, {
                messages,
                maxTokens: 512,
            })
        ).toMatchObject({ max_tokens: 512 });
    });
});

describe('reasoning support', () => {
    it('should include cache_control when cacheControl provider option is set', () => {
        const request = createGenerateRequest('claude-sonnet-4-6', 4096, {
            messages: [{ role: 'user', content: 'Hello' }],
            providerOptions: {
                anthropic: {
                    cacheControl: { type: 'ephemeral' },
                },
            },
        });

        expect(request).toHaveProperty('cache_control', { type: 'ephemeral' });
    });

    it('should pass ttl in cache_control when specified', () => {
        const request = createGenerateRequest('claude-sonnet-4-6', 4096, {
            messages: [{ role: 'user', content: 'Hello' }],
            providerOptions: {
                anthropic: {
                    cacheControl: { type: 'ephemeral', ttl: '1h' },
                },
            },
        });

        expect(request).toHaveProperty('cache_control', {
            type: 'ephemeral',
            ttl: '1h',
        });
    });

    it('should include cache_control in stream request', () => {
        const request = createStreamRequest('claude-sonnet-4-6', 4096, {
            messages: [{ role: 'user', content: 'Hello' }],
            providerOptions: {
                anthropic: {
                    cacheControl: { type: 'ephemeral' },
                },
            },
        });

        expect(request).toHaveProperty('cache_control', { type: 'ephemeral' });
        expect(request).toHaveProperty('stream', true);
    });

    it('should keep provider betas out of the request body', () => {
        const options = {
            messages: [{ role: 'user' as const, content: 'Hello' }],
            providerOptions: {
                anthropic: {
                    betas: ['custom-beta'],
                },
            },
        };
        const request = createGenerateRequest('claude-sonnet-5', 4096, options);

        expect(request).not.toHaveProperty('betas');
        expect(getAnthropicRequestBetas('claude-sonnet-5', options)).toEqual([
            'custom-beta',
        ]);
    });

    it('should validate incompatible config when reasoning is enabled', () => {
        expect(() =>
            createGenerateRequest('claude-sonnet-4', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'high' },
                temperature: 0.2,
            })
        ).toThrowError(ValidationError);

        expect(() =>
            createStreamRequest('claude-sonnet-4', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'high' },
                topP: 0.9,
            })
        ).toThrowError(ValidationError);

        expect(() =>
            createGenerateRequest('claude-sonnet-4', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'high' },
                toolChoice: { type: 'tool', toolName: 'search' },
            })
        ).toThrowError(ValidationError);

        expect(() =>
            createGenerateRequest('claude-sonnet-4', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'high' },
                toolChoice: 'required',
            })
        ).toThrowError(ValidationError);

        expect(() =>
            createGenerateRequest('claude-sonnet-4', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'high' },
                topP: 0.95,
            })
        ).not.toThrow();

        expect(() =>
            createGenerateRequest('claude-sonnet-4', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'high' },
                toolChoice: 'auto',
                topP: 0.96,
            })
        ).not.toThrow();

        expect(() =>
            createGenerateRequest('claude-sonnet-4', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'high' },
                toolChoice: 'none',
            })
        ).not.toThrow();

        expect(() =>
            createGenerateRequest('claude-sonnet-4', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'high' },
                providerOptions: { anthropic: { topK: 5 } },
            })
        ).toThrowError(ValidationError);

        // An explicit limit that leaves no room beyond the smallest thinking
        // budget is rejected; the same limit as a default is sized up instead.
        expect(() =>
            createGenerateRequest('claude-sonnet-4-5', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'minimal' },
                maxTokens: 1024,
            })
        ).toThrowError(ValidationError);

        expect(() =>
            createGenerateRequest('claude-sonnet-4-5', 1024, {
                messages: [{ role: 'user', content: 'Hi' }],
                reasoning: { effort: 'minimal' },
            })
        ).not.toThrow();
    });

    it('should attribute validation errors to a custom provider id', () => {
        expect.assertions(2);

        try {
            createGenerateRequest(
                'claude-sonnet-4',
                4096,
                {
                    messages: [{ role: 'user', content: 'Hi' }],
                    reasoning: { effort: 'high' },
                    temperature: 0.2,
                },
                'anthropic-vertex'
            );
        } catch (error) {
            expect(error).toBeInstanceOf(ValidationError);
            expect((error as ValidationError).provider).toBe(
                'anthropic-vertex'
            );
        }
    });

    it('should reject non-default sampling for newer models without explicit reasoning', () => {
        expect(() =>
            createGenerateRequest('claude-sonnet-5', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                temperature: 0.5,
            })
        ).toThrowError(ValidationError);

        expect(() =>
            createGenerateRequest('claude-sonnet-5', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                temperature: 1,
                topP: 1,
            })
        ).not.toThrow();
    });

    it('should reject invalid anthropic provider options', () => {
        const invalidProviderOptions = {
            anthropic: { topK: '5' },
        } as unknown as GenerateOptions['providerOptions'];

        expect(() =>
            createGenerateRequest('claude-sonnet-4', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                providerOptions: invalidProviderOptions,
            })
        ).toThrowError(/expected number/);
    });

    it('should reject null anthropic provider options', () => {
        const invalidProviderOptions = {
            anthropic: null,
        } as unknown as GenerateOptions['providerOptions'];

        expect(() =>
            createGenerateRequest('claude-sonnet-4', 4096, {
                messages: [{ role: 'user', content: 'Hi' }],
                providerOptions: invalidProviderOptions,
            })
        ).toThrowError(/expected object, received null/);
    });

    it('should parse thinking and redacted_thinking blocks from responses', () => {
        const response = asAnthropicMessage({
            content: [
                {
                    type: 'thinking',
                    thinking: 'step-by-step',
                    signature: 'sig_1',
                },
                { type: 'redacted_thinking', data: 'hidden_data' },
                { type: 'text', text: 'answer', citations: null },
            ],
            stop_reason: 'end_turn',
            usage: {
                input_tokens: 10,
                output_tokens: 3,
                output_tokens_details: { thinking_tokens: 2 },
            },
        });

        const result = mapGenerateResponse(response);
        expect(result.reasoning).toBe('step-by-step');
        expect(result.content).toBe('answer');
        expect(result.parts[0]).toEqual({
            type: 'reasoning',
            text: 'step-by-step',
            providerMetadata: {
                anthropic: { signature: 'sig_1' },
            },
        });
        expect(result.parts[1]).toEqual({
            type: 'reasoning',
            text: '',
            providerMetadata: {
                anthropic: { redactedData: 'hidden_data' },
            },
        });
        expect(result.usage.outputTokenDetails.reasoningTokens).toBe(2);
    });

    it('should parse thinking block without signature', () => {
        const response = asAnthropicMessage({
            content: [
                { type: 'thinking', thinking: 'bare thought' },
                { type: 'text', text: 'answer', citations: null },
            ],
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 3 },
        });

        const result = mapGenerateResponse(response);
        expect(result.parts[0]).toEqual({
            type: 'reasoning',
            text: 'bare thought',
            providerMetadata: { anthropic: {} },
        });
    });

    it('should emit reasoning events from thinking deltas in streams', async () => {
        const events = [];
        for await (const event of transformStream(
            toAsyncIterable<RawMessageStreamEvent>([
                {
                    type: 'message_start',
                    message: asAnthropicMessage({
                        content: [],
                        stop_reason: null,
                        usage: { input_tokens: 10, output_tokens: 0 },
                    }),
                },
                {
                    type: 'content_block_start',
                    index: 0,
                    content_block: {
                        type: 'thinking',
                        thinking: '',
                    } as never,
                },
                {
                    type: 'content_block_delta',
                    index: 0,
                    delta: {
                        type: 'thinking_delta',
                        thinking: 'reason ',
                    } as never,
                },
                {
                    type: 'content_block_delta',
                    index: 0,
                    delta: {
                        type: 'signature_delta',
                        signature: 'sig_1',
                    } as never,
                },
                {
                    type: 'content_block_stop',
                    index: 0,
                },
                {
                    type: 'message_delta',
                    delta: {
                        stop_reason: 'end_turn',
                        stop_sequence: null,
                        container: null,
                        stop_details: null,
                    },
                    usage: {
                        input_tokens: 10,
                        output_tokens: 2,
                        cache_creation_input_tokens: null,
                        cache_read_input_tokens: null,
                        output_tokens_details: null,
                        server_tool_use: null,
                    },
                },
                {
                    type: 'message_stop',
                },
            ])
        )) {
            events.push(event);
        }

        expect(events.map((event) => event.type)).toContain('reasoning-start');
        expect(events.map((event) => event.type)).toContain('reasoning-delta');
        expect(events.map((event) => event.type)).toContain('reasoning-end');
        expect(events.find((event) => event.type === 'reasoning-end')).toEqual({
            type: 'reasoning-end',
            providerMetadata: {
                anthropic: { signature: 'sig_1' },
            },
        });
    });

    it('should preserve redacted thinking data in streams', async () => {
        const events = [];
        for await (const event of transformStream(
            toAsyncIterable<RawMessageStreamEvent>([
                {
                    type: 'content_block_start',
                    index: 0,
                    content_block: {
                        type: 'redacted_thinking',
                        data: 'redacted_payload',
                    },
                },
                {
                    type: 'content_block_stop',
                    index: 0,
                },
                {
                    type: 'message_stop',
                },
            ])
        )) {
            events.push(event);
        }

        expect(events.slice(0, 2)).toEqual([
            { type: 'reasoning-start' },
            {
                type: 'reasoning-end',
                providerMetadata: {
                    anthropic: { redactedData: 'redacted_payload' },
                },
            },
        ]);
    });

    it('should emit reasoning-end before tool-call events in stream', async () => {
        const events = [];
        for await (const event of transformStream(
            toAsyncIterable<RawMessageStreamEvent>([
                {
                    type: 'message_start',
                    message: asAnthropicMessage({
                        content: [],
                        stop_reason: null,
                        usage: { input_tokens: 10, output_tokens: 0 },
                    }),
                },
                {
                    type: 'content_block_start',
                    index: 0,
                    content_block: {
                        type: 'thinking',
                        thinking: '',
                    } as never,
                },
                {
                    type: 'content_block_delta',
                    index: 0,
                    delta: {
                        type: 'thinking_delta',
                        thinking: 'reasoning',
                    } as never,
                },
                {
                    type: 'content_block_stop',
                    index: 0,
                },
                {
                    type: 'content_block_start',
                    index: 1,
                    content_block: {
                        type: 'tool_use',
                        id: 'tu_1',
                        name: 'search',
                        input: {},
                    } as never,
                },
                {
                    type: 'content_block_delta',
                    index: 1,
                    delta: {
                        type: 'input_json_delta',
                        partial_json: '{"q":"test"}',
                    } as never,
                },
                {
                    type: 'content_block_stop',
                    index: 1,
                },
                {
                    type: 'message_delta',
                    delta: {
                        stop_reason: 'tool_use',
                        stop_sequence: null,
                        container: null,
                        stop_details: null,
                    },
                    usage: {
                        input_tokens: 10,
                        output_tokens: 4,
                        cache_creation_input_tokens: null,
                        cache_read_input_tokens: null,
                        output_tokens_details: null,
                        server_tool_use: null,
                    },
                },
                { type: 'message_stop' },
            ])
        )) {
            events.push(event);
        }

        const types = events.map((e) => e.type);
        const reasoningEndIdx = types.indexOf('reasoning-end');
        const toolCallStartIdx = types.indexOf('tool-call-start');
        expect(reasoningEndIdx).toBeGreaterThan(-1);
        expect(toolCallStartIdx).toBeGreaterThan(reasoningEndIdx);
    });

    it('should close reasoning at end of stream when only thinking is present', async () => {
        const events = [];
        for await (const event of transformStream(
            toAsyncIterable<RawMessageStreamEvent>([
                {
                    type: 'message_start',
                    message: asAnthropicMessage({
                        content: [],
                        stop_reason: null,
                        usage: { input_tokens: 10, output_tokens: 0 },
                    }),
                },
                {
                    type: 'content_block_start',
                    index: 0,
                    content_block: {
                        type: 'thinking',
                        thinking: '',
                    } as never,
                },
                {
                    type: 'content_block_delta',
                    index: 0,
                    delta: {
                        type: 'thinking_delta',
                        thinking: 'only reasoning',
                    } as never,
                },
                {
                    type: 'content_block_stop',
                    index: 0,
                },
                {
                    type: 'message_delta',
                    delta: {
                        stop_reason: 'end_turn',
                        stop_sequence: null,
                        container: null,
                        stop_details: null,
                    },
                    usage: {
                        input_tokens: 10,
                        output_tokens: 1,
                        cache_creation_input_tokens: null,
                        cache_read_input_tokens: null,
                        output_tokens_details: null,
                        server_tool_use: null,
                    },
                },
                { type: 'message_stop' },
            ])
        )) {
            events.push(event);
        }

        const types = events.map((e) => e.type);
        expect(types).toEqual([
            'reasoning-start',
            'reasoning-delta',
            'reasoning-end',
            'finish',
        ]);
    });

    it('should preserve reasoning token usage when message_delta omits output_tokens_details', async () => {
        const events = [];
        for await (const event of transformStream(
            toAsyncIterable<RawMessageStreamEvent>([
                {
                    type: 'message_start',
                    message: asAnthropicMessage({
                        content: [],
                        stop_reason: null,
                        usage: {
                            input_tokens: 10,
                            output_tokens: 0,
                            output_tokens_details: { thinking_tokens: 3 },
                        },
                    }),
                },
                {
                    type: 'message_delta',
                    delta: {
                        stop_reason: 'end_turn',
                        stop_sequence: null,
                        container: null,
                        stop_details: null,
                    },
                    usage: {
                        input_tokens: 10,
                        output_tokens: 2,
                        cache_creation_input_tokens: null,
                        cache_read_input_tokens: null,
                        output_tokens_details: null,
                        server_tool_use: null,
                    },
                },
                { type: 'message_stop' },
            ])
        )) {
            events.push(event);
        }

        const finish = events.find((event) => event.type === 'finish');
        expect(finish?.usage.outputTokenDetails.reasoningTokens).toBe(3);
    });
});

function createTools(count: number, strict?: boolean): ToolSet {
    return Object.fromEntries(
        Array.from({ length: count }, (_, index) => {
            const name = `tool-${index}`;
            return [
                name,
                defineTool({
                    name,
                    description: `Tool ${index}`,
                    parameters: z.object({ value: z.string() }),
                    ...(strict === undefined ? {} : { strict }),
                }),
            ];
        })
    );
}

function asAnthropicMessage(value: {
    content: unknown[];
    stop_reason: AnthropicMessage['stop_reason'];
    usage: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens?: number | null;
        cache_creation_input_tokens?: number | null;
        output_tokens_details?: { thinking_tokens: number } | null;
    };
}): AnthropicMessage {
    return {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-4-5',
        stop_sequence: null,
        container: null,
        content: value.content as AnthropicMessage['content'],
        stop_reason: value.stop_reason,
        usage: {
            input_tokens: value.usage.input_tokens,
            output_tokens: value.usage.output_tokens,
            cache_creation: null,
            cache_creation_input_tokens:
                value.usage.cache_creation_input_tokens ?? null,
            cache_read_input_tokens:
                value.usage.cache_read_input_tokens ?? null,
            server_tool_use: null,
            service_tier: null,
            output_tokens_details: value.usage.output_tokens_details ?? null,
            input_tokens_details: null,
            cache_creation_tokens: null,
            cache_read_tokens: null,
            total_tokens: null,
            request_id: null,
            inference_geo: null,
        },
    } as unknown as AnthropicMessage;
}
