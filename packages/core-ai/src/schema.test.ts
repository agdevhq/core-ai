import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ValidationError } from './errors.ts';
import { getToolJsonSchema, normalizeSchema, toJsonSchema } from './schema.ts';
import type { StandardSchemaWithJson } from './types.ts';

type FakeSchemaOptions = {
    jsonSchema?: Record<string, unknown> | (() => never);
    validate?: StandardSchemaWithJson<{ id: string }>['~standard']['validate'];
};

/** A minimal Standard Schema implementation, as a library would ship one. */
function createFakeSchema(options: FakeSchemaOptions = {}) {
    const input = vi.fn(() =>
        typeof options.jsonSchema === 'function'
            ? options.jsonSchema()
            : (options.jsonSchema ?? { type: 'object' })
    );
    const schema: StandardSchemaWithJson<{ id: string }> = {
        '~standard': {
            version: 1,
            vendor: 'fake',
            validate:
                options.validate ??
                ((value) => ({ value: value as { id: string } })),
            jsonSchema: { input, output: input },
        },
    };
    return { schema, input };
}

describe('toJsonSchema', () => {
    it('converts a Zod schema to the JSON Schema of its input type', () => {
        const jsonSchema = toJsonSchema(
            z.object({
                query: z.string(),
                limit: z.number().default(10),
            })
        );

        expect(jsonSchema).toMatchObject({
            type: 'object',
            properties: {
                query: { type: 'string' },
                limit: { type: 'number' },
            },
            required: ['query'],
        });
    });

    it('matches z.toJSONSchema in input mode byte for byte', () => {
        const schema = z.object({
            target: z.discriminatedUnion('kind', [
                z.object({ kind: z.literal('branch'), name: z.string() }),
                z.object({ kind: z.literal('commit'), sha: z.string() }),
            ]),
            at: z.iso.datetime().optional(),
        });

        expect(JSON.stringify(toJsonSchema(schema))).toBe(
            JSON.stringify(z.toJSONSchema(schema, { io: 'input' }))
        );
    });

    it('returns plain JSON Schema unchanged', () => {
        const jsonSchema = {
            type: 'object',
            properties: { tags: { type: 'array', uniqueItems: true } },
        };

        expect(toJsonSchema(jsonSchema)).toEqual(jsonSchema);
    });

    it('converts a Standard Schema once and reuses the result', () => {
        const { schema, input } = createFakeSchema();

        const first = toJsonSchema(schema);
        const second = toJsonSchema(schema);

        expect(second).toEqual(first);
        expect(input).toHaveBeenCalledTimes(1);
        expect(input).toHaveBeenCalledWith({ target: 'draft-2020-12' });
    });

    it('returns a copy that does not change what core-ai sends', () => {
        const tool = {
            name: 'search',
            description: 'Search',
            parameters: z.object({ query: z.string() }),
        };

        const jsonSchema = toJsonSchema(tool.parameters);
        delete jsonSchema.required;

        expect(getToolJsonSchema(tool)).toHaveProperty('required', ['query']);
    });

    it('accepts schemas that are functions, like ArkType types', () => {
        const props = createFakeSchema().schema['~standard'];
        const schema = Object.assign(() => undefined, {
            '~standard': props,
        });

        expect(toJsonSchema(schema)).toEqual({ type: 'object' });
    });

    it('wraps a failed conversion in a ValidationError naming the schema', () => {
        const { schema } = createFakeSchema({
            jsonSchema: () => {
                throw new Error('Date cannot be represented in JSON Schema');
            },
        });

        const convert = () =>
            getToolJsonSchema({
                name: 'schedule',
                description: 'Schedule a meeting',
                parameters: schema,
            });

        expect(convert).toThrow(ValidationError);
        expect(convert).toThrow(
            'tool "schedule" parameters cannot be converted to JSON Schema (vendor "fake"): Date cannot be represented in JSON Schema'
        );
    });

    it('rejects Zod types JSON Schema cannot express', () => {
        expect(() => toJsonSchema(z.object({ timestamp: z.date() }))).toThrow(
            ValidationError
        );
    });

    it('rejects a Standard Schema without Standard JSON Schema support', () => {
        const schema = {
            '~standard': {
                version: 1,
                vendor: 'legacy',
                validate: (value: unknown) => ({ value }),
            },
        };

        expect(() =>
            toJsonSchema(schema as unknown as StandardSchemaWithJson)
        ).toThrow(
            /schema is a Standard Schema \(vendor "legacy"\) without Standard JSON Schema support/
        );
    });

    it('rejects values that are not a schema', () => {
        expect(() =>
            toJsonSchema([] as unknown as Record<string, unknown>)
        ).toThrow(ValidationError);
    });
});

describe('normalizeSchema', () => {
    it('exposes the Standard Schema validator', async () => {
        const normalized = normalizeSchema(z.object({ id: z.string() }));

        expect(await normalized.validate?.({ id: 'a' })).toEqual({
            value: { id: 'a' },
        });
        const failure = await normalized.validate?.({ id: 1 });
        expect(failure?.issues?.[0]?.path).toEqual(['id']);
    });

    it('has no validator for plain JSON Schema', () => {
        expect(normalizeSchema({ type: 'object' }).validate).toBeUndefined();
    });
});
