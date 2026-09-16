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
 * schema (`z.int()`, `z.number().int()`). Each half is checked on its own
 * because a user bound replaces only one of them: `z.int().min(0)` keeps the
 * implicit `maximum`, which is still a serialization artifact rather than a
 * user-declared constraint.
 */
export function isImplicitSafeIntegerBound(
    node: Record<string, unknown>,
    key: 'minimum' | 'maximum'
): boolean {
    if (node.type !== 'integer') {
        return false;
    }
    return key === 'minimum'
        ? node.minimum === -MAX_SAFE_INTEGER_BOUND
        : node.maximum === MAX_SAFE_INTEGER_BOUND;
}

export type ChildSchemaNodeEntry = {
    /** Path segment relative to the parent node, e.g. `properties.limit`. */
    segment: string;
    child: unknown;
};

/** Keywords whose value is a map of named child schemas. */
const NESTED_MAP_KEYWORDS = ['properties'] as const;
/** Keywords whose value is a list of child schemas. */
const NESTED_LIST_KEYWORDS = ['anyOf', 'oneOf', 'allOf'] as const;
/** Keywords whose value is a single child schema. */
const NESTED_SINGLE_KEYWORDS = ['items'] as const;
/** Root-level containers of named, `$ref`-addressable definitions. */
const DEFINITION_KEYWORDS = ['$defs', 'definitions'] as const;

/**
 * Enumerates the nested schema nodes of a JSON Schema node: `properties.*`,
 * `items`, `anyOf[*]`, `oneOf[*]`, and `allOf[*]`. Definition containers are
 * enumerated separately by {@link getSchemaDefinitionEntries}.
 *
 * Both the strict-schema contract validator and
 * {@link normalizeStrictJsonSchema} traverse through this function (the
 * normalizer via {@link mapChildSchemaNodes}), so a schema node cannot be
 * validated but left untransformed, or vice versa.
 */
export function getChildSchemaNodeEntries(
    node: Record<string, unknown>
): ChildSchemaNodeEntry[] {
    const entries = getNamedChildEntries(node, NESTED_MAP_KEYWORDS);

    for (const keyword of NESTED_SINGLE_KEYWORDS) {
        if (node[keyword] !== undefined) {
            entries.push({ segment: keyword, child: node[keyword] });
        }
    }
    for (const keyword of NESTED_LIST_KEYWORDS) {
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
 * Enumerates the named definitions of a node's `$defs` / `definitions`
 * containers, with segments like `$defs.Point`.
 */
export function getSchemaDefinitionEntries(
    node: Record<string, unknown>
): ChildSchemaNodeEntry[] {
    return getNamedChildEntries(node, DEFINITION_KEYWORDS);
}

function getNamedChildEntries(
    node: Record<string, unknown>,
    keywords: readonly string[]
): ChildSchemaNodeEntry[] {
    const entries: ChildSchemaNodeEntry[] = [];

    for (const keyword of keywords) {
        const value = node[keyword];
        if (isPlainObject(value)) {
            for (const [key, child] of Object.entries(value)) {
                entries.push({ segment: `${keyword}.${key}`, child });
            }
        }
    }

    return entries;
}

/**
 * Returns a shallow copy of `node` with every nested schema node (the same set
 * {@link getChildSchemaNodeEntries} and {@link getSchemaDefinitionEntries}
 * enumerate) replaced by `map(child)`.
 */
export function mapChildSchemaNodes(
    node: Record<string, unknown>,
    map: (child: unknown) => unknown
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...node };

    for (const keyword of [...NESTED_MAP_KEYWORDS, ...DEFINITION_KEYWORDS]) {
        const value = result[keyword];
        if (isPlainObject(value)) {
            result[keyword] = Object.fromEntries(
                Object.entries(value).map(([key, child]) => [key, map(child)])
            );
        }
    }
    for (const keyword of NESTED_SINGLE_KEYWORDS) {
        if (result[keyword] !== undefined) {
            result[keyword] = map(result[keyword]);
        }
    }
    for (const keyword of NESTED_LIST_KEYWORDS) {
        const value = result[keyword];
        if (Array.isArray(value)) {
            result[keyword] = value.map((child) => map(child));
        }
    }

    return result;
}

/**
 * Normalizes the JSON Schema of a strict tool for providers whose strict mode
 * requires closed objects (OpenAI-style APIs). The transform is semantics
 * preserving with respect to the tool's Zod schema:
 *
 * - drops `$schema` (metadata, not a constraint),
 * - sets `additionalProperties: false` on object nodes where absent, which
 *   matches `z.object()` semantics (unknown keys are stripped at parse time),
 * - drops Zod's implicit safe-integer bounds on integer nodes (see
 *   {@link isImplicitSafeIntegerBound}),
 * - rewrites `oneOf` to `anyOf`. Zod emits `oneOf` only for
 *   `z.discriminatedUnion()`, whose branches are disjoint by construction, so
 *   the two keywords accept the same values there — and strict-capable
 *   providers accept `anyOf` only.
 *
 * It never widens or narrows what the user's Zod schema accepts; schemas that
 * cannot be expressed in the strict subset are rejected by the contract
 * validator instead of being rewritten.
 */
export function normalizeStrictJsonSchema(
    schema: Record<string, unknown>
): Record<string, unknown> {
    return normalizeObjectNode(schema);
}

function normalizeNode(node: unknown): unknown {
    return isPlainObject(node) ? normalizeObjectNode(node) : node;
}

function normalizeObjectNode(
    node: Record<string, unknown>
): Record<string, unknown> {
    const stripped: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(node)) {
        if (key === '$schema') {
            continue;
        }
        if (
            (key === 'minimum' || key === 'maximum') &&
            isImplicitSafeIntegerBound(node, key)
        ) {
            continue;
        }
        stripped[key] = value;
    }

    const result = mapChildSchemaNodes(stripped, normalizeNode);

    if (Array.isArray(result.oneOf) && result.anyOf === undefined) {
        result.anyOf = result.oneOf;
        delete result.oneOf;
    }

    if (
        isObjectSchemaNode(result) &&
        result.additionalProperties === undefined
    ) {
        result.additionalProperties = false;
    }

    return result;
}
