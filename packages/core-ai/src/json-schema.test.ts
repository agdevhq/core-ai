import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    canRequireOptionalKey,
    getChildSchemaNodeEntries,
    getSchemaDefinitionEntries,
    mapChildSchemaNodes,
    normalizeStrictJsonSchema,
    requireEveryKey,
} from './json-schema.ts';
import { toJsonSchema } from './schema.ts';

describe('normalizeStrictJsonSchema', () => {
    it('strips $schema and closes the root object', () => {
        const normalized = normalizeStrictJsonSchema(
            toJsonSchema(z.object({ query: z.string() }))
        );

        expect(normalized).not.toHaveProperty('$schema');
        expect(normalized).toMatchObject({
            type: 'object',
            additionalProperties: false,
        });
    });

    it('closes nested objects in properties, items, and unions', () => {
        const normalized = normalizeStrictJsonSchema(
            toJsonSchema(
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
            toJsonSchema(z.strictObject({ value: z.string() }))
        );

        expect(normalized['additionalProperties']).toBe(false);
    });

    it('drops the implicit safe-integer bounds of z.int()', () => {
        const normalized = normalizeStrictJsonSchema(
            toJsonSchema(z.object({ count: z.int() }))
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
            toJsonSchema(z.object({ count: z.int().min(0) }))
        );

        const count = (
            normalized.properties as Record<string, Record<string, unknown>>
        )['count'];
        expect(count).toMatchObject({ type: 'integer', minimum: 0 });
        expect(count).not.toHaveProperty('maximum');
    });

    it('rewrites oneOf from z.discriminatedUnion to anyOf at every depth', () => {
        const normalized = normalizeStrictJsonSchema(
            toJsonSchema(
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
        const source = toJsonSchema(
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
        prefixItems: [openObject],
        $defs: { Def: openObject },
        definitions: { Legacy: openObject },
    };
    const expectedSegments = [
        'properties.prop',
        'items',
        'anyOf.0',
        'oneOf.0',
        'allOf.0',
        'prefixItems.0',
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
            prefixItems: ['mapped'],
            $defs: { Def: 'mapped' },
            definitions: { Legacy: 'mapped' },
        });
    });

    it('keeps children that are not objects', () => {
        const node = { type: 'array', items: true, anyOf: [false, openObject] };

        expect(mapChildSchemaNodes(node, () => 'mapped')).toEqual({
            type: 'array',
            items: true,
            anyOf: [false, 'mapped'],
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
            prefixItems: [closed],
            $defs: { Def: closed },
            definitions: { Legacy: closed },
        });
    });
});

describe('canRequireOptionalKey', () => {
    it('accepts keys that accept null or declare a default', () => {
        const root = {
            $defs: {
                Maybe: { type: ['string', 'null'] },
                'a/b': { type: 'null' },
                Loop: { $ref: '#/$defs/Loop' },
            },
        };
        const accepts = (property: unknown) =>
            canRequireOptionalKey(property, root);

        expect(accepts({ type: ['string', 'null'] })).toBe(true);
        expect(accepts({ anyOf: [{ type: 'string' }, { type: 'null' }] })).toBe(
            true
        );
        expect(accepts({ type: 'string', default: 'a' })).toBe(true);
        expect(accepts({ $ref: '#/$defs/Maybe' })).toBe(true);
        expect(accepts({ $ref: '#/$defs/a~1b' })).toBe(true);
        expect(accepts({ $ref: '#/$defs/Loop' })).toBe(false);
        expect(accepts({ type: 'string' })).toBe(false);
        expect(accepts(true)).toBe(false);
    });
});

describe('requireEveryKey', () => {
    it('requires nullable and defaulted keys at every depth', () => {
        const nullableString = {
            anyOf: [{ type: 'string' }, { type: 'null' }],
        };
        const schema = {
            type: 'object',
            properties: {
                label: nullableString,
                mode: { type: 'string', default: 'safe' },
                nested: { $ref: '#/$defs/Nested' },
            },
            required: ['nested', 'extra'],
            $defs: {
                Nested: {
                    type: 'object',
                    properties: { note: { ...nullableString, default: null } },
                },
            },
        };

        expect(requireEveryKey(schema)).toEqual({
            schema: {
                type: 'object',
                properties: schema.properties,
                required: ['label', 'mode', 'nested', 'extra'],
                $defs: {
                    Nested: {
                        type: 'object',
                        // A null default adds nothing once the key is required
                        properties: { note: nullableString },
                        required: ['note'],
                    },
                },
            },
            optionalKeyPaths: [],
        });
    });

    it('reports optional keys it cannot require by path', () => {
        const result = requireEveryKey(
            toJsonSchema(
                z.object({
                    limit: z.number().optional(),
                    filter: z.object({ tag: z.string().optional() }),
                })
            )
        );

        expect(result.optionalKeyPaths).toEqual([
            'properties.limit',
            'properties.filter.properties.tag',
        ]);
        // Keys that cannot be required stay optional
        expect(result.schema.required).toEqual(['filter']);
    });

    it('leaves objects without requirable optional keys unchanged', () => {
        const schema = { type: 'object', properties: {} };

        expect(requireEveryKey(schema).schema).toEqual(schema);
    });
});
