import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    getChildSchemaNodeEntries,
    getSchemaDefinitionEntries,
    mapChildSchemaNodes,
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

    it('drops an implicit safe-integer bound independently of its pair', () => {
        const normalized = normalizeStrictJsonSchema(
            zodSchemaToJsonSchema(z.object({ count: z.int().min(0) }))
        );

        const count = (
            normalized.properties as Record<string, Record<string, unknown>>
        )['count'];
        expect(count).toMatchObject({ type: 'integer', minimum: 0 });
        expect(count).not.toHaveProperty('maximum');
    });

    it('rewrites oneOf from z.discriminatedUnion to anyOf at every depth', () => {
        const normalized = normalizeStrictJsonSchema(
            zodSchemaToJsonSchema(
                z.object({
                    action: z.discriminatedUnion('kind', [
                        z.object({ kind: z.literal('open'), path: z.string() }),
                        z.object({ kind: z.literal('close') }),
                    ]),
                    steps: z.array(
                        z.discriminatedUnion('kind', [
                            z.object({ kind: z.literal('a') }),
                            z.object({ kind: z.literal('b') }),
                        ])
                    ),
                })
            )
        );

        const properties = normalized.properties as Record<
            string,
            Record<string, unknown>
        >;
        expect(properties['action']).not.toHaveProperty('oneOf');
        const branches = properties['action']?.['anyOf'] as Array<
            Record<string, unknown>
        >;
        expect(branches).toHaveLength(2);
        for (const branch of branches) {
            expect(branch).toMatchObject({ additionalProperties: false });
        }
        const items = properties['steps']?.['items'] as Record<string, unknown>;
        expect(items).not.toHaveProperty('oneOf');
        expect(items['anyOf']).toHaveLength(2);
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

describe('schema node traversal', () => {
    // One object node at every nesting position the walker knows about. The
    // contract validator walks via getChildSchemaNodeEntries and the strict
    // normalizer maps via mapChildSchemaNodes; this fixture pins the two to
    // the same set of positions.
    const openObject = {
        type: 'object',
        properties: { v: { type: 'string' } },
    };
    const fixture = {
        type: 'object',
        properties: { prop: openObject },
        items: openObject,
        anyOf: [openObject],
        oneOf: [openObject],
        allOf: [openObject],
        $defs: { Def: openObject },
        definitions: { Legacy: openObject },
    };
    const expectedSegments = [
        'properties.prop',
        'items',
        'anyOf.0',
        'oneOf.0',
        'allOf.0',
        '$defs.Def',
        'definitions.Legacy',
    ];

    it('enumerates every nested position', () => {
        const segments = [
            ...getChildSchemaNodeEntries(fixture),
            ...getSchemaDefinitionEntries(fixture),
        ].map((entry) => entry.segment);
        expect(segments.sort()).toEqual([...expectedSegments].sort());
    });

    it('maps every enumerated position and nothing else', () => {
        const seen: unknown[] = [];
        const mapped = mapChildSchemaNodes(fixture, (child) => {
            seen.push(child);
            return 'mapped';
        });

        expect(seen).toHaveLength(expectedSegments.length);
        expect(mapped).toEqual({
            type: 'object',
            properties: { prop: 'mapped' },
            items: 'mapped',
            anyOf: ['mapped'],
            oneOf: ['mapped'],
            allOf: ['mapped'],
            $defs: { Def: 'mapped' },
            definitions: { Legacy: 'mapped' },
        });
    });

    it('normalizes every position the validator walks', () => {
        const normalized = normalizeStrictJsonSchema(fixture);
        const closed = { ...openObject, additionalProperties: false };

        expect(normalized).toEqual({
            type: 'object',
            additionalProperties: false,
            properties: { prop: closed },
            items: closed,
            // the fixture has both keywords, so oneOf is left in place
            anyOf: [closed],
            oneOf: [closed],
            allOf: [closed],
            $defs: { Def: closed },
            definitions: { Legacy: closed },
        });
    });
});
