import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    StructuredOutputParseError,
    StructuredOutputValidationError,
} from './errors.ts';
import { normalizeSchema } from './schema.ts';
import {
    formatSchemaIssues,
    parseStructuredOutput,
    validateStructuredOutput,
} from './structured-output.ts';

describe('parseStructuredOutput', () => {
    it('returns the schema output for valid JSON', async () => {
        const schema = normalizeSchema(
            z.object({ count: z.string().transform(Number) })
        );

        await expect(
            parseStructuredOutput(schema, '{"count":"3"}', 'test')
        ).resolves.toEqual({ count: 3 });
    });

    it('throws StructuredOutputParseError for invalid JSON', async () => {
        const schema = normalizeSchema(z.object({}));

        const error = await parseStructuredOutput(schema, '{', 'test').catch(
            (caught: unknown) => caught
        );
        expect(error).toBeInstanceOf(StructuredOutputParseError);
        expect(error).toMatchObject({ provider: 'test', rawOutput: '{' });
    });

    it('returns the parsed JSON unvalidated for plain JSON Schema', async () => {
        const schema = normalizeSchema({
            type: 'object',
            properties: { count: { type: 'number' } },
        });

        await expect(
            parseStructuredOutput(schema, '{"count":"not a number"}', 'test')
        ).resolves.toEqual({ count: 'not a number' });
    });
});

describe('validateStructuredOutput', () => {
    it('throws StructuredOutputValidationError with formatted issues', async () => {
        const schema = normalizeSchema(
            z.object({ user: z.object({ name: z.string() }) })
        );

        const error = await validateStructuredOutput(
            schema,
            { user: { name: 1 } },
            'test',
            '{"user":{"name":1}}'
        ).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(StructuredOutputValidationError);
        expect(error).toMatchObject({
            provider: 'test',
            rawOutput: '{"user":{"name":1}}',
            issues: [
                'user.name: Invalid input: expected string, received number',
            ],
        });
    });

    it('awaits asynchronous validators', async () => {
        const schema = {
            jsonSchema: { type: 'object' },
            validate: async (value: unknown) => ({ value: { wrapped: value } }),
        };

        await expect(
            validateStructuredOutput(schema, 1, 'test')
        ).resolves.toEqual({ wrapped: 1 });
    });
});

describe('formatSchemaIssues', () => {
    it('formats path segments and root issues', () => {
        expect(
            formatSchemaIssues([
                { message: 'bad', path: ['items', 0, { key: 'id' }] },
                { message: 'missing' },
                { message: 'empty', path: [] },
            ])
        ).toEqual(['items.0.id: bad', '<root>: missing', '<root>: empty']);
    });
});
