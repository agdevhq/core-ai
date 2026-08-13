import { z } from 'zod';

/**
 * Convert a Zod schema to a JSON Schema object using Zod 4's native
 * `z.toJSONSchema()`.
 */
export function zodSchemaToJsonSchema(
    schema: z.ZodType
): Record<string, unknown> {
    return z.toJSONSchema(schema, {
        io: 'input',
    }) as Record<string, unknown>;
}

const MAX_SAFE_INTEGER_BOUND = 9007199254740991;

export function isPlainObject(
    value: unknown
): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isObjectSchemaNode(node: Record<string, unknown>): boolean {
    return node.type === 'object' || isPlainObject(node.properties);
}

/**
 * Zod stamps `minimum: -(2^53 - 1)` / `maximum: 2^53 - 1` onto every integer
 * schema (`z.int()`, `z.number().int()`). That exact pair is a serialization
 * artifact rather than a user-declared range constraint.
 */
export function isImplicitSafeIntegerBounds(
    node: Record<string, unknown>
): boolean {
    return (
        node.type === 'integer' &&
        node.minimum === -MAX_SAFE_INTEGER_BOUND &&
        node.maximum === MAX_SAFE_INTEGER_BOUND
    );
}

export type ChildSchemaNodeEntry = {
    /** Path segment relative to the parent node, e.g. `properties.limit`. */
    segment: string;
    child: unknown;
};

/**
 * Enumerates the nested schema nodes of a JSON Schema node: `properties.*`,
 * `items`, `anyOf[*]`, and `allOf[*]`. Root-level `$defs` / `definitions`
 * containers are handled separately by every consumer.
 *
 * The strict-schema contract validator traverses through this function, and
 * {@link normalizeStrictJsonSchema} recurses over the identical key set —
 * shared fixtures in the tests pin the two together so a schema node cannot
 * be validated but left untransformed, or vice versa.
 */
export function getChildSchemaNodeEntries(
    node: Record<string, unknown>
): ChildSchemaNodeEntry[] {
    const entries: ChildSchemaNodeEntry[] = [];

    if (isPlainObject(node.properties)) {
        for (const [key, child] of Object.entries(node.properties)) {
            entries.push({ segment: `properties.${key}`, child });
        }
    }
    if (node.items !== undefined) {
        entries.push({ segment: 'items', child: node.items });
    }
    for (const keyword of ['anyOf', 'allOf'] as const) {
        const value = node[keyword];
        if (Array.isArray(value)) {
            value.forEach((child, index) => {
                entries.push({ segment: `${keyword}.${index}`, child });
            });
        }
    }

    return entries;
}

/**
 * Normalizes the JSON Schema of a strict tool for providers whose strict mode
 * requires closed objects (OpenAI-style APIs). The transform is semantics
 * preserving with respect to the tool's Zod schema:
 *
 * - drops `$schema` (metadata, not a constraint),
 * - sets `additionalProperties: false` on object nodes where absent, which
 *   matches `z.object()` semantics (unknown keys are stripped at parse time),
 * - drops Zod's implicit safe-integer bounds pair on integer nodes (see
 *   {@link isImplicitSafeIntegerBounds}).
 *
 * It never widens or narrows what the user's Zod schema accepts; schemas that
 * cannot be expressed in the strict subset are rejected by the contract
 * validator instead of being rewritten.
 */
export function normalizeStrictJsonSchema(
    schema: Record<string, unknown>
): Record<string, unknown> {
    const normalized = normalizeNode(schema);
    return isPlainObject(normalized) ? normalized : schema;
}

function normalizeNode(node: unknown): unknown {
    if (!isPlainObject(node)) {
        return node;
    }

    const dropImplicitBounds = isImplicitSafeIntegerBounds(node);
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(node)) {
        if (key === '$schema') {
            continue;
        }
        if (dropImplicitBounds && (key === 'minimum' || key === 'maximum')) {
            continue;
        }
        result[key] = value;
    }

    if (isPlainObject(result.properties)) {
        result.properties = Object.fromEntries(
            Object.entries(result.properties).map(([key, child]) => [
                key,
                normalizeNode(child),
            ])
        );
    }
    if (result.items !== undefined) {
        result.items = normalizeNode(result.items);
    }
    for (const keyword of ['anyOf', 'allOf'] as const) {
        const value = result[keyword];
        if (Array.isArray(value)) {
            result[keyword] = value.map((child) => normalizeNode(child));
        }
    }
    for (const container of ['$defs', 'definitions'] as const) {
        const value = result[container];
        if (isPlainObject(value)) {
            result[container] = Object.fromEntries(
                Object.entries(value).map(([key, child]) => [
                    key,
                    normalizeNode(child),
                ])
            );
        }
    }

    if (isObjectSchemaNode(result) && result.additionalProperties === undefined) {
        result.additionalProperties = false;
    }

    return result;
}
