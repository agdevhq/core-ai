import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ToolSchemaStrictnessError } from './errors.ts';
import {
    SUPPORTED_TOOL_SCHEMA_STRICTNESS,
    TEXT_ONLY_MODALITIES,
    UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
} from './model-capabilities.ts';
import { getToolJsonSchema } from './schema.ts';
import type {
    ModelCapabilities,
    ToolDefinition,
    ToolSchemaStrictnessCapabilities,
    ToolSet,
} from './types.ts';
import {
    countUnionParameters,
    validateToolSchemaStrictness,
} from './validate-tool-schema-strictness.ts';

function createCapabilities(
    strictSchemas: ToolSchemaStrictnessCapabilities
): ModelCapabilities {
    return {
        reasoning: {
            mode: 'unsupported',
            supportedEfforts: [],
            restrictsSamplingParams: false,
            supportedToolChoices: ['auto', 'none', 'required', 'tool'],
        },
        modalities: TEXT_ONLY_MODALITIES,
        tools: { strictSchemas, toolDiscovery: 'emulated' },
        messages: { systemPlacement: 'anywhere' },
    };
}

function createTool(name: string, strict?: boolean): ToolDefinition {
    return {
        name,
        description: `Tool ${name}`,
        parameters: z.object({ value: z.string() }),
        ...(strict === undefined ? {} : { strict }),
    };
}

function createToolSet(tools: ToolDefinition[]): ToolSet {
    return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}

const TOOLS: ToolSet = createToolSet([
    createTool('strict', true),
    createTool('default'),
]);

describe('validateToolSchemaStrictness', () => {
    it('accepts strict tools when supported', () => {
        expect(() =>
            validateToolSchemaStrictness({
                tools: TOOLS,
                capabilities: createCapabilities(
                    SUPPORTED_TOOL_SCHEMA_STRICTNESS
                ),
                providerId: 'provider',
                modelId: 'model',
            })
        ).not.toThrow();
    });

    it('rejects explicit strict tools when unsupported', () => {
        try {
            validateToolSchemaStrictness({
                tools: TOOLS,
                capabilities: createCapabilities(
                    UNSUPPORTED_TOOL_SCHEMA_STRICTNESS
                ),
                providerId: 'google',
                modelId: 'gemini',
            });
            expect.unreachable();
        } catch (error) {
            expect(error).toBeInstanceOf(ToolSchemaStrictnessError);
            const strictnessError = error as ToolSchemaStrictnessError;
            expect(strictnessError.reason).toBe('unsupported');
            expect(strictnessError.toolNames).toEqual(['strict']);
        }
    });

    it('allows false and omitted strictness when unsupported', () => {
        const tools = createToolSet([
            createTool('standard', false),
            createTool('omitted'),
        ]);

        expect(() =>
            validateToolSchemaStrictness({
                tools,
                capabilities: createCapabilities(
                    UNSUPPORTED_TOOL_SCHEMA_STRICTNESS
                ),
                providerId: 'google',
                modelId: 'gemini',
            })
        ).not.toThrow();
    });

    it('counts only explicitly strict tools toward the limit', () => {
        const tools = createToolSet([
            createTool('strict', true),
            ...Array.from({ length: 25 }, (_, index) =>
                createTool(`plain-${index}`)
            ),
        ]);

        expect(() =>
            validateToolSchemaStrictness({
                tools,
                capabilities: createCapabilities({
                    supported: true,
                    maxStrictTools: 20,
                }),
                providerId: 'anthropic',
                modelId: 'claude',
            })
        ).not.toThrow();
    });

    it('enforces the strict tool limit', () => {
        const tools = createToolSet([
            createTool('one', true),
            createTool('two', true),
        ]);

        try {
            validateToolSchemaStrictness({
                tools,
                capabilities: createCapabilities({
                    supported: true,
                    maxStrictTools: 1,
                }),
                providerId: 'anthropic',
                modelId: 'claude',
            });
            expect.unreachable();
        } catch (error) {
            expect(error).toBeInstanceOf(ToolSchemaStrictnessError);
            const strictnessError = error as ToolSchemaStrictnessError;
            expect(strictnessError.reason).toBe('limit-exceeded');
            expect(strictnessError.toolNames).toEqual(['one', 'two']);
            expect(strictnessError.maxStrictTools).toBe(1);
        }
    });

    it('rejects strict tools whose schemas violate the contract', () => {
        const tools: ToolSet = {
            search: {
                name: 'search',
                description: 'Search',
                parameters: z.object({
                    query: z.string(),
                    limit: z.number().optional(),
                }),
                strict: true,
            },
            fetch: {
                name: 'fetch',
                description: 'Fetch',
                parameters: z.object({ url: z.string().min(8) }),
                strict: true,
            },
        };

        try {
            validateToolSchemaStrictness({
                tools,
                capabilities: createCapabilities(
                    SUPPORTED_TOOL_SCHEMA_STRICTNESS
                ),
                providerId: 'openai',
                modelId: 'gpt-4o',
            });
            expect.unreachable();
        } catch (error) {
            expect(error).toBeInstanceOf(ToolSchemaStrictnessError);
            const strictnessError = error as ToolSchemaStrictnessError;
            expect(strictnessError.reason).toBe('invalid-schema');
            expect(strictnessError.toolNames).toEqual(['search', 'fetch']);
            expect(strictnessError.violations).toBeDefined();
            expect(strictnessError.message).toContain('properties.limit');
            expect(strictnessError.message).toContain('.nullable()');
            expect(strictnessError.message).toContain('minLength');
        }
    });

    it('attributes cached violations to each tool that shares a schema', () => {
        const parameters = z.object({ limit: z.number().optional() });
        const tools: ToolSet = {
            first: {
                name: 'first',
                description: 'First',
                parameters,
                strict: true,
            },
            second: {
                name: 'second',
                description: 'Second',
                parameters,
                strict: true,
            },
        };

        try {
            validateToolSchemaStrictness({
                tools,
                capabilities: createCapabilities(
                    SUPPORTED_TOOL_SCHEMA_STRICTNESS
                ),
                providerId: 'openai',
                modelId: 'gpt-4o',
            });
            expect.unreachable();
        } catch (error) {
            expect(error).toBeInstanceOf(ToolSchemaStrictnessError);
            const strictnessError = error as ToolSchemaStrictnessError;
            expect(strictnessError.toolNames).toEqual(['first', 'second']);
            expect(strictnessError.violations?.map((v) => v.toolName)).toEqual([
                'first',
                'second',
            ]);
        }
    });

    it('ignores contract violations on non-strict tools', () => {
        const tools: ToolSet = {
            loose: {
                name: 'loose',
                description: 'Loose tool',
                parameters: z.object({ limit: z.number().optional() }),
            },
        };

        expect(() =>
            validateToolSchemaStrictness({
                tools,
                capabilities: createCapabilities(
                    SUPPORTED_TOOL_SCHEMA_STRICTNESS
                ),
                providerId: 'openai',
                modelId: 'gpt-4o',
            })
        ).not.toThrow();
    });
});

function closedObject(
    properties: Record<string, Record<string, unknown>>,
    extra: Record<string, unknown> = {}
): Record<string, unknown> {
    return {
        type: 'object',
        properties,
        required: Object.keys(properties),
        additionalProperties: false,
        ...extra,
    };
}

function nullableFields(
    prefix: string,
    count: number
): Record<string, Record<string, unknown>> {
    return Object.fromEntries(
        Array.from({ length: count }, (_, index) => [
            `${prefix}${index}`,
            { type: ['string', 'null'] },
        ])
    );
}

// Each case mirrors a live probe of Anthropic's union parameter count.
describe('countUnionParameters', () => {
    it.each([
        ['type arrays with null', closedObject(nullableFields('a', 3)), 3],
        [
            'anyOf with null',
            closedObject({
                a: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            }),
            1,
        ],
        [
            'non-null unions',
            closedObject({
                a: { anyOf: [{ type: 'string' }, { type: 'number' }] },
                b: { type: ['string', 'number'] },
                c: { oneOf: [{ type: 'string' }, { type: 'number' }] },
            }),
            3,
        ],
        [
            'nested objects at any depth',
            closedObject({
                outer: closedObject({
                    inner: closedObject(nullableFields('n', 2)),
                }),
            }),
            2,
        ],
        [
            'objects in array items',
            closedObject({
                list: {
                    type: 'array',
                    items: closedObject(nullableFields('n', 2)),
                },
            }),
            2,
        ],
        [
            'anyOf branches and the union property itself',
            closedObject({
                variant: {
                    anyOf: [
                        closedObject(nullableFields('x', 2)),
                        closedObject(nullableFields('y', 2)),
                    ],
                },
            }),
            5,
        ],
        [
            'only the node of a type-array object',
            closedObject({
                maybe: closedObject(nullableFields('n', 3), {
                    type: ['object', 'null'],
                }),
            }),
            1,
        ],
        [
            'no union array items',
            closedObject({
                list: { type: 'array', items: { type: ['string', 'null'] } },
            }),
            0,
        ],
        ['no enums with null', closedObject({ a: { enum: ['a', null] } }), 0],
        [
            'no $defs, referenced or not',
            closedObject(
                { a: { $ref: '#/$defs/Pair' }, b: { $ref: '#/$defs/Pair' } },
                { $defs: { Pair: closedObject(nullableFields('n', 2)) } }
            ),
            0,
        ],
    ])('counts %s', (_label, schema, expected) => {
        expect(countUnionParameters(schema)).toBe(expected);
    });

    it('counts Zod nullable fields', () => {
        const tool: ToolDefinition = {
            name: 'save',
            description: 'Save',
            parameters: z.object({
                title: z.string().nullable(),
                tags: z.array(z.object({ label: z.string().nullable() })),
            }),
        };

        expect(countUnionParameters(getToolJsonSchema(tool))).toBe(2);
    });
});

describe('validateToolSchemaStrictness union parameter limit', () => {
    const unionTool = (name: string, count: number, strict = true) => ({
        name,
        description: name,
        parameters: closedObject(nullableFields('f', count)),
        strict,
    });
    const capabilities = createCapabilities({
        supported: true,
        maxUnionParameters: 16,
    });

    it('accepts union parameters up to the limit across strict tools', () => {
        expect(() =>
            validateToolSchemaStrictness({
                tools: createToolSet([
                    unionTool('a', 9),
                    unionTool('b', 7),
                    unionTool('plain', 20, false),
                ]),
                capabilities,
                providerId: 'anthropic',
                modelId: 'claude',
            })
        ).not.toThrow();
    });

    it('rejects strict tools beyond the limit', () => {
        try {
            validateToolSchemaStrictness({
                tools: createToolSet([
                    unionTool('a', 9),
                    unionTool('b', 9),
                    createTool('none', true),
                ]),
                capabilities,
                providerId: 'anthropic',
                modelId: 'claude',
            });
            expect.unreachable();
        } catch (error) {
            expect(error).toBeInstanceOf(ToolSchemaStrictnessError);
            const strictnessError = error as ToolSchemaStrictnessError;
            expect(strictnessError.reason).toBe('union-limit-exceeded');
            expect(strictnessError.toolNames).toEqual(['a', 'b']);
            expect(strictnessError.maxUnionParameters).toBe(16);
            expect(strictnessError.unionParameterCount).toBe(18);
        }
    });

    it('does not count without a limit', () => {
        expect(() =>
            validateToolSchemaStrictness({
                tools: createToolSet([unionTool('a', 40)]),
                capabilities: createCapabilities(
                    SUPPORTED_TOOL_SCHEMA_STRICTNESS
                ),
                providerId: 'openai',
                modelId: 'gpt',
            })
        ).not.toThrow();
    });
});
