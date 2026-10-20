import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { ValidationError } from './errors.ts';
import type { StandardSchemaV1 } from './standard-schema.ts';
import {
    defineTool,
    PORTABLE_TOOL_NAME_PATTERN,
    toPortableToolName,
    validateToolCall,
} from './tool.ts';
import type { ToolDefinition } from './types.ts';

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

describe('validateToolCall', () => {
    const search = defineTool({
        name: 'search',
        description: 'Search the web',
        parameters: z.object({ limit: z.coerce.number() }),
    });

    it('returns the typed schema output for valid arguments', async () => {
        const result = await validateToolCall(search, {
            id: '1',
            name: 'search',
            arguments: { limit: '5' },
        });

        expect(result).toEqual({ value: { limit: 5 } });
        expectTypeOf(result).toEqualTypeOf<
            StandardSchemaV1.Result<{ limit: number }>
        >();
    });

    it('returns the issues of invalid arguments', async () => {
        const result = await validateToolCall(search, {
            id: '1',
            name: 'search',
            arguments: { limit: 'many' },
        });

        expect(result.issues).toHaveLength(1);
    });

    it('reports a validator that throws as an issue', async () => {
        const open = defineTool({
            name: 'open',
            description: 'Open a page',
            parameters: z.object({
                url: z.string().transform((url) => new URL(url)),
            }),
        });

        const result = await validateToolCall(open, {
            id: '1',
            name: 'open',
            arguments: { url: 'not a url' },
        });

        expect(result.issues).toEqual([
            { message: expect.stringContaining('validation threw:') },
        ]);
    });

    it('returns undefined for plain JSON Schema parameters', async () => {
        const lookup = defineTool({
            name: 'lookup',
            description: 'Look up a record',
            parameters: {
                type: 'object',
                properties: { id: { type: 'string' } },
            },
        });

        const result = await validateToolCall(lookup, {
            id: '1',
            name: 'lookup',
            arguments: { id: 7 },
        });

        expect(result).toBeUndefined();
        expectTypeOf(result).toEqualTypeOf<undefined>();
    });

    it('returns an untyped result for a tool of any schema type', async () => {
        const tool: ToolDefinition = search;

        const result = await validateToolCall(tool, {
            id: '1',
            name: 'search',
            arguments: { limit: 5 },
        });

        expect(result).toEqual({ value: { limit: 5 } });
        expectTypeOf(result).toEqualTypeOf<
            StandardSchemaV1.Result<unknown> | undefined
        >();
    });

    it('throws for a call to another tool', async () => {
        await expect(
            validateToolCall(search, {
                id: '1',
                name: 'lookup',
                arguments: { limit: 5 },
            })
        ).rejects.toThrow(ValidationError);
    });
});

describe('toPortableToolName', () => {
    it.each(['search', '_private', 'book-meeting_2', 'a'.repeat(128)])(
        'returns the valid name %s unchanged',
        (name) => {
            expect(toPortableToolName(name)).toBe(name);
        }
    );

    // Pinned: results end up in conversation histories, so they must not
    // change between versions.
    it.each([
        ['github.create_issue', 'github_create_issue'],
        ['1tool', '_1tool'],
        ['-tool', '_-tool'],
        ['', '_'],
        ['été.outil', '_t__outil'],
    ])('converts %j to %j', (name, expected) => {
        expect(toPortableToolName(name)).toBe(expected);
    });

    it('converts different names to the same one when only invalid characters differ', () => {
        expect(toPortableToolName('a.b')).toBe('a_b');
        expect(toPortableToolName('a:b')).toBe('a_b');
    });

    it('truncates long names to 128 characters', () => {
        expect(toPortableToolName(`${'a'.repeat(200)}.b`)).toBe(
            'a'.repeat(128)
        );
    });

    it.each(['-tool', 'server:tool', 'a b', 'x'.repeat(300), '🙂'])(
        'returns a portable name for %j',
        (name) => {
            expect(toPortableToolName(name)).toMatch(
                PORTABLE_TOOL_NAME_PATTERN
            );
        }
    );
});
