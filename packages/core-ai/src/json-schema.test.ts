import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    normalizeStrictJsonSchema,
    zodSchemaToJsonSchema,
} from './json-schema.ts';

describe('zodSchemaToJsonSchema', () => {
    it('should convert a basic object schema', () => {
        const schema = z.object({
            name: z.string(),
            age: z.number(),
        });

        const jsonSchema = zodSchemaToJsonSchema(schema);

        expect(jsonSchema).toMatchObject({
            type: 'object',
            properties: {
                name: { type: 'string' },
                age: { type: 'number' },
            },
            required: ['name', 'age'],
        });
    });

    it('should treat .default() fields as optional (input mode)', () => {
        const schema = z.object({
            query: z.string(),
            limit: z.number().default(10),
        });

        const jsonSchema = zodSchemaToJsonSchema(schema);

        expect(jsonSchema).toMatchObject({
            type: 'object',
            properties: {
                query: { type: 'string' },
                limit: { type: 'number' },
            },
        });
        const required = jsonSchema['required'] as string[];
        expect(required).toContain('query');
        expect(required).not.toContain('limit');
    });

    it('should serialize the input type for transforms', () => {
        const schema = z.object({
            value: z.string().transform((val) => val.length),
        });

        const jsonSchema = zodSchemaToJsonSchema(schema);

        expect(jsonSchema).toMatchObject({
            type: 'object',
            properties: {
                value: { type: 'string' },
            },
        });
    });

    it('should throw for unrepresentable types like z.date()', () => {
        const schema = z.object({
            timestamp: z.date(),
        });

        expect(() => zodSchemaToJsonSchema(schema)).toThrow();
    });
});

describe('normalizeStrictJsonSchema', () => {
    it('strips $schema and closes the root object', () => {
        const normalized = normalizeStrictJsonSchema(
            zodSchemaToJsonSchema(z.object({ query: z.string() }))
        );

        expect(normalized).not.toHaveProperty('$schema');
        expect(normalized).toMatchObject({
            type: 'object',
            additionalProperties: false,
        });
    });

    it('closes nested objects in properties, items, and unions', () => {
        const normalized = normalizeStrictJsonSchema(
            zodSchemaToJsonSchema(
                z.object({
                    filter: z.object({ field: z.string() }),
                    entries: z.array(z.object({ id: z.string() })),
                    variant: z.union([
                        z.object({ kind: z.literal('a') }),
                        z.object({ kind: z.literal('b') }),
                    ]),
                })
            )
        );

        const properties = normalized.properties as Record<
            string,
            Record<string, unknown>
        >;
        expect(properties['filter']).toMatchObject({
            additionalProperties: false,
        });
        expect(properties['entries']?.['items']).toMatchObject({
            additionalProperties: false,
        });
        const variants = properties['variant']?.['anyOf'] as Array<
            Record<string, unknown>
        >;
        for (const variant of variants) {
            expect(variant).toMatchObject({ additionalProperties: false });
        }
    });

    it('preserves an existing additionalProperties: false', () => {
        const normalized = normalizeStrictJsonSchema(
            zodSchemaToJsonSchema(z.strictObject({ value: z.string() }))
        );

        expect(normalized['additionalProperties']).toBe(false);
    });

    it('drops the implicit safe-integer bounds of z.int()', () => {
        const normalized = normalizeStrictJsonSchema(
            zodSchemaToJsonSchema(z.object({ count: z.int() }))
        );

        const count = (
            normalized.properties as Record<string, Record<string, unknown>>
        )['count'];
        expect(count).toMatchObject({ type: 'integer' });
        expect(count).not.toHaveProperty('minimum');
        expect(count).not.toHaveProperty('maximum');
    });

    it('does not touch the input schema object', () => {
        const source = zodSchemaToJsonSchema(
            z.object({ nested: z.object({ value: z.string() }) })
        );
        const before = JSON.parse(JSON.stringify(source)) as unknown;

        normalizeStrictJsonSchema(source);

        expect(source).toEqual(before);
    });
});
