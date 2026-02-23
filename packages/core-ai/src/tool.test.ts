import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool, toolSetToJsonSchemas } from './tool.ts';

describe('defineTool', () => {
    it('should create a tool definition from a Zod schema', () => {
        const tool = defineTool({
            name: 'search',
            description: 'Search the web',
            parameters: z.object({
                query: z.string().describe('The search query'),
            }),
        });

        expect(tool.name).toBe('search');
        expect(tool.description).toBe('Search the web');
        expect(tool.parameters).toBeDefined();
    });
});

describe('toolSetToJsonSchemas', () => {
    it('should convert a tool set to JSON Schema format', () => {
        const tools = {
            search: defineTool({
                name: 'search',
                description: 'Search the web',
                parameters: z.object({
                    query: z.string(),
                }),
            }),
            calculate: defineTool({
                name: 'calculate',
                description: 'Evaluate a math expression',
                parameters: z.object({
                    expression: z.string(),
                }),
            }),
        };

        const schemas = toolSetToJsonSchemas(tools);

        expect(schemas).toHaveLength(2);
        expect(schemas[0]?.name).toBe('search');
        expect(schemas[0]?.description).toBe('Search the web');
        expect(schemas[0]?.parameters).toMatchObject({
            type: 'object',
            properties: {
                query: { type: 'string' },
            },
            required: ['query'],
        });
    });

    it('should return empty array for undefined tool set', () => {
        expect(toolSetToJsonSchemas(undefined)).toEqual([]);
    });
});
