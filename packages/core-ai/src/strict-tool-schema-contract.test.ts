import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { zodSchemaToJsonSchema } from './json-schema.ts';
import { getStrictToolSchemaViolations } from './strict-tool-schema-contract.ts';

function violationsFor(schema: z.ZodType) {
    return getStrictToolSchemaViolations(
        'tool',
        zodSchemaToJsonSchema(schema)
    );
}

describe('getStrictToolSchemaViolations', () => {
    it('accepts a plain closed object with required keys', () => {
        expect(
            violationsFor(
                z.object({
                    query: z.string(),
                    count: z.number().int(),
                    mode: z.enum(['fast', 'safe']),
                })
            )
        ).toEqual([]);
    });

    it('accepts nullable values, nested objects, arrays, and unions', () => {
        expect(
            violationsFor(
                z.object({
                    name: z.string().nullable(),
                    filters: z.array(
                        z.object({
                            field: z.string(),
                            value: z.union([z.string(), z.number()]),
                        })
                    ),
                    kind: z.literal('search'),
                })
            )
        ).toEqual([]);
    });

    it('accepts supported string formats', () => {
        expect(
            violationsFor(
                z.object({
                    id: z.uuid(),
                    contact: z.email(),
                })
            )
        ).toEqual([]);
    });

    it('exempts the implicit safe-integer bounds of z.int()', () => {
        const schema = zodSchemaToJsonSchema(z.object({ count: z.int() }));
        expect(getStrictToolSchemaViolations('tool', schema)).toEqual([]);
    });

    it('rejects optional keys with a .nullable() hint', () => {
        const violations = violationsFor(
            z.object({ limit: z.number().optional() })
        );
        expect(violations).toHaveLength(1);
        expect(violations[0]?.path).toBe('properties.limit');
        expect(violations[0]?.message).toContain('.nullable()');
    });

    it('rejects open objects from z.looseObject and z.record', () => {
        const loose = violationsFor(z.looseObject({ value: z.string() }));
        expect(loose.some((v) => v.path === 'additionalProperties')).toBe(
            true
        );

        const record = violationsFor(z.record(z.string(), z.number()));
        expect(record.length).toBeGreaterThan(0);
    });

    it('rejects .catchall() objects', () => {
        const violations = violationsFor(
            z.object({ value: z.string() }).catchall(z.number())
        );
        expect(violations.some((v) => v.path === 'additionalProperties')).toBe(
            true
        );
    });

    it('rejects string length constraints but allows patterns', () => {
        const violations = violationsFor(
            z.object({
                short: z.string().min(2),
                shaped: z.string().regex(/^a/),
            })
        );
        const paths = violations.map((v) => v.path);
        expect(paths).toEqual(['properties.short.minLength']);
        expect(
            violations.find((v) => v.path.endsWith('minLength'))?.message
        ).toContain('validate lengths after parsing');
    });

    it('rejects explicit numeric bounds but not implicit integer bounds', () => {
        const violations = violationsFor(
            z.object({
                bounded: z.number().min(0).max(10),
                counter: z.int(),
            })
        );
        const paths = violations.map((v) => v.path);
        expect(paths).toContain('properties.bounded.minimum');
        expect(paths).toContain('properties.bounded.maximum');
        expect(paths.every((path) => !path.includes('counter'))).toBe(true);
    });

    it('rejects tuples', () => {
        const violations = violationsFor(
            z.object({ pair: z.tuple([z.string(), z.number()]) })
        );
        expect(
            violations.some((v) => v.message.includes('z.tuple'))
        ).toBe(true);
    });

    it('rejects unsupported string formats', () => {
        const violations = violationsFor(z.object({ site: z.emoji() }));
        expect(violations.some((v) => v.path.endsWith('format'))).toBe(true);
    });

    it('rejects recursive schemas', () => {
        type Node = { name: string; children: Node[] };
        const node: z.ZodType<Node> = z.lazy(() =>
            z.object({
                name: z.string(),
                children: z.array(node),
            })
        );
        const violations = violationsFor(z.object({ root: node }));
        expect(
            violations.some((v) => v.message.includes('recursive'))
        ).toBe(true);
    });

    it('accepts non-recursive shared definitions', () => {
        const point = z.object({ x: z.number(), y: z.number() });
        expect(
            violationsFor(z.object({ start: point, end: point }))
        ).toEqual([]);
    });

    it('reports deep paths', () => {
        const violations = violationsFor(
            z.object({
                filter: z.object({
                    tags: z.array(z.string().max(10)),
                }),
            })
        );
        expect(violations[0]?.path).toBe(
            'properties.filter.properties.tags.items.maxLength'
        );
    });

    it('reports every violation across the schema', () => {
        const violations = violationsFor(
            z.object({
                a: z.string().optional(),
                b: z.string().min(1),
            })
        );
        expect(violations.length).toBeGreaterThanOrEqual(2);
    });
});
