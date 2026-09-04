import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ToolSchemaStrictnessError } from './errors.ts';
import {
    SUPPORTED_TOOL_SCHEMA_STRICTNESS,
    TEXT_ONLY_MODALITIES,
    UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
} from './model-capabilities.ts';
import type {
    ModelCapabilities,
    ToolDefinition,
    ToolSchemaStrictnessCapabilities,
    ToolSet,
} from './types.ts';
import { validateToolSchemaStrictness } from './validate-tool-schema-strictness.ts';

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
        tools: { strictSchemas },
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
