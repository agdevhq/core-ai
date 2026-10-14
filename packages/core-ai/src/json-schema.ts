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
const NESTED_LIST_KEYWORDS = [
    'anyOf',
    'oneOf',
    'allOf',
    'prefixItems',
] as const;
/** Keywords whose value is a single child schema. */
const NESTED_SINGLE_KEYWORDS = ['items'] as const;
/** Root-level containers of named, `$ref`-addressable definitions. */
const DEFINITION_KEYWORDS = ['$defs', 'definitions'] as const;

/**
 * Enumerates the nested schema nodes of a JSON Schema node: `properties.*`,
 * `items`, `anyOf[*]`, `oneOf[*]`, `allOf[*]`, and `prefixItems[*]`.
 * Definition containers are
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
 * Returns a shallow copy of `node` with every nested object schema (the
 * positions {@link getChildSchemaNodeEntries} and
 * {@link getSchemaDefinitionEntries} enumerate) replaced by
 * `map(child, segment)`, where `segment` is the child's path segment as those
 * functions report it. Children that are not objects, such as boolean
 * schemas, are kept as is.
 */
export function mapChildSchemaNodes(
    node: Record<string, unknown>,
    map: (child: Record<string, unknown>, segment: string) => unknown
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...node };
    const mapChild = (child: unknown, segment: string): unknown =>
        isPlainObject(child) ? map(child, segment) : child;

    for (const keyword of [...NESTED_MAP_KEYWORDS, ...DEFINITION_KEYWORDS]) {
        const value = result[keyword];
        if (isPlainObject(value)) {
            result[keyword] = Object.fromEntries(
                Object.entries(value).map(([key, child]) => [
                    key,
                    mapChild(child, `${keyword}.${key}`),
                ])
            );
        }
    }
    for (const keyword of NESTED_SINGLE_KEYWORDS) {
        if (result[keyword] !== undefined) {
            result[keyword] = mapChild(result[keyword], keyword);
        }
    }
    for (const keyword of NESTED_LIST_KEYWORDS) {
        const value = result[keyword];
        if (Array.isArray(value)) {
            result[keyword] = value.map((child, index) =>
                mapChild(child, `${keyword}.${index}`)
            );
        }
    }

    return result;
}

/**
 * Normalizes the JSON Schema of a strict tool for providers whose strict mode
 * requires closed objects (OpenAI-style APIs). The result accepts no value
 * the original schema rejects, except where noted:
 *
 * - drops `$schema` (metadata, not a constraint),
 * - sets `additionalProperties: false` on object nodes where absent. This
 *   matches `z.object()` semantics (unknown keys are stripped at parse
 *   time); for plain JSON Schema, where an absent keyword allows unknown
 *   keys, it narrows what the model may send,
 * - drops Zod's implicit safe-integer bounds on integer nodes (see
 *   {@link isImplicitSafeIntegerBound}), which admits only integers beyond
 *   ±(2^53 - 1),
 * - rewrites `oneOf` to `anyOf`, the only composition keyword strict-capable
 *   providers accept. Both accept the same values when the branches are
 *   disjoint, as for `z.discriminatedUnion()`, the only construct Zod emits
 *   `oneOf` for. Overlapping `oneOf` branches in hand-written JSON Schema
 *   are widened to `anyOf`.
 *
 * Schemas that cannot be expressed in the strict subset are rejected by the
 * contract validator instead of being rewritten.
 */
export function normalizeStrictJsonSchema(
    schema: Record<string, unknown>
): Record<string, unknown> {
    return normalizeObjectNode(schema);
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

    const result = mapChildSchemaNodes(stripped, normalizeObjectNode);

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
