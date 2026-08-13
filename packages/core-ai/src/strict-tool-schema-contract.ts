import {
    getChildSchemaNodeEntries,
    isImplicitSafeIntegerBounds,
    isObjectSchemaNode,
    isPlainObject,
} from './json-schema.ts';

/**
 * A single violation of the strict-capable schema contract, reported against
 * the JSON Schema derived from the tool's Zod `parameters`.
 */
export type StrictToolSchemaViolation = {
    toolName: string;
    /** Dot path into the tool's JSON Schema, e.g. `properties.limit`. */
    path: string;
    /** What is wrong and how to fix it. */
    message: string;
};

const MAX_SCHEMA_DEPTH = 64;

const ALLOWED_KEYWORDS = new Set([
    '$schema',
    '$ref',
    '$defs',
    'definitions',
    'type',
    'properties',
    'required',
    'additionalProperties',
    'items',
    'enum',
    'const',
    'anyOf',
    'allOf',
    'format',
    'pattern',
    'title',
    'description',
    'default',
    'examples',
    'minimum',
    'maximum',
]);

const ALLOWED_TYPES = new Set([
    'object',
    'array',
    'string',
    'number',
    'integer',
    'boolean',
    'null',
]);

const ALLOWED_STRING_FORMATS = new Set([
    'date-time',
    'time',
    'date',
    'duration',
    'email',
    'hostname',
    'ipv4',
    'ipv6',
    'uuid',
    'uri',
]);

const KEYWORD_HINTS: Record<string, string> = {
    minLength:
        'remove .min()/.length() — string length constraints are outside the strict-capable subset; validate lengths after parsing instead',
    maxLength:
        'remove .max()/.length() — string length constraints are outside the strict-capable subset; validate lengths after parsing instead',
    minimum:
        'remove numeric bounds (.min()/.gt()/.gte()) — numeric range constraints are outside the strict-capable subset; validate ranges after parsing instead',
    maximum:
        'remove numeric bounds (.max()/.lt()/.lte()) — numeric range constraints are outside the strict-capable subset; validate ranges after parsing instead',
    exclusiveMinimum:
        'remove .gt() — numeric range constraints are outside the strict-capable subset; validate ranges after parsing instead',
    exclusiveMaximum:
        'remove .lt() — numeric range constraints are outside the strict-capable subset; validate ranges after parsing instead',
    multipleOf:
        'remove .multipleOf()/.step() — numeric constraints are outside the strict-capable subset; validate after parsing instead',
    minItems:
        'remove .min()/.nonempty() on arrays — array length constraints are outside the strict-capable subset; validate after parsing instead',
    maxItems:
        'remove .max() on arrays — array length constraints are outside the strict-capable subset; validate after parsing instead',
    uniqueItems:
        'array uniqueness constraints are outside the strict-capable subset; validate after parsing instead',
    prefixItems:
        'tuples (z.tuple) are not strict-capable; use a uniform z.array() or an object instead',
    oneOf: 'oneOf is not strict-capable; use a union (anyOf via z.union/z.discriminatedUnion) instead',
    not: 'negated schemas (not) are not strict-capable',
    patternProperties:
        'pattern properties are not strict-capable; declare explicit keys with z.object()',
    propertyNames:
        'property-name constraints are not strict-capable; declare explicit keys with z.object()',
};

/**
 * Checks the JSON Schema of a strict tool against the strict-capable schema
 * contract: closed objects with every key required, the basic type set, and
 * the keyword/format subset every strict-capable provider accepts.
 *
 * Pure and non-throwing — returns every violation found so callers can report
 * them all at once.
 */
export function getStrictToolSchemaViolations(
    toolName: string,
    schema: Record<string, unknown>
): StrictToolSchemaViolation[] {
    const violations: StrictToolSchemaViolation[] = [];
    const refEdges = new Map<string, Set<string>>();

    walkNode(schema, '', 'root', 0, toolName, violations, refEdges);

    for (const [containerName, definitions] of getDefinitionContainers(
        schema
    )) {
        for (const [definitionName, definitionNode] of Object.entries(
            definitions
        )) {
            walkNode(
                definitionNode,
                `${containerName}.${definitionName}`,
                `${containerName}.${definitionName}`,
                0,
                toolName,
                violations,
                refEdges
            );
        }
    }

    for (const region of findCyclicRegions(refEdges)) {
        violations.push({
            toolName,
            path: region === 'root' ? '' : region,
            message:
                'recursive schemas (z.lazy or self-referencing types) are not strict-capable',
        });
    }

    return violations;
}

function walkNode(
    node: unknown,
    path: string,
    region: string,
    depth: number,
    toolName: string,
    violations: StrictToolSchemaViolation[],
    refEdges: Map<string, Set<string>>
): void {
    if (!isPlainObject(node)) {
        return;
    }

    if (depth > MAX_SCHEMA_DEPTH) {
        violations.push({
            toolName,
            path,
            message: `schema nesting exceeds the supported depth of ${MAX_SCHEMA_DEPTH}`,
        });
        return;
    }

    for (const key of Object.keys(node)) {
        if (ALLOWED_KEYWORDS.has(key)) {
            continue;
        }
        const hint = KEYWORD_HINTS[key];
        violations.push({
            toolName,
            path: joinPath(path, key),
            message:
                hint ??
                `keyword "${key}" is outside the strict-capable subset; remove it and validate after parsing instead`,
        });
    }

    validateBounds(node, path, toolName, violations);
    validateType(node, path, toolName, violations);
    validateFormat(node, path, toolName, violations);
    validateObjectShape(node, path, toolName, violations);
    validateRef(node, path, region, toolName, violations, refEdges);

    for (const { segment, child } of getChildSchemaNodeEntries(node)) {
        walkNode(
            child,
            joinPath(path, segment),
            region,
            depth + 1,
            toolName,
            violations,
            refEdges
        );
    }
}

function validateBounds(
    node: Record<string, unknown>,
    path: string,
    toolName: string,
    violations: StrictToolSchemaViolation[]
): void {
    if (!('minimum' in node) && !('maximum' in node)) {
        return;
    }
    // Zod stamps implicit safe-integer bounds onto every z.int(); that pair is
    // an artifact of serialization, not a user constraint, and is exempt.
    if (isImplicitSafeIntegerBounds(node)) {
        return;
    }
    for (const key of ['minimum', 'maximum'] as const) {
        if (key in node) {
            violations.push({
                toolName,
                path: joinPath(path, key),
                message: KEYWORD_HINTS[key] ?? '',
            });
        }
    }
}

function validateType(
    node: Record<string, unknown>,
    path: string,
    toolName: string,
    violations: StrictToolSchemaViolation[]
): void {
    if (!('type' in node)) {
        return;
    }
    const types = Array.isArray(node.type) ? node.type : [node.type];
    for (const type of types) {
        if (typeof type !== 'string' || !ALLOWED_TYPES.has(type)) {
            violations.push({
                toolName,
                path: joinPath(path, 'type'),
                message: `type "${String(type)}" is outside the strict-capable subset (object, array, string, number, integer, boolean, null)`,
            });
        }
    }
}

function validateFormat(
    node: Record<string, unknown>,
    path: string,
    toolName: string,
    violations: StrictToolSchemaViolation[]
): void {
    if (typeof node.format !== 'string') {
        return;
    }
    if (!ALLOWED_STRING_FORMATS.has(node.format)) {
        violations.push({
            toolName,
            path: joinPath(path, 'format'),
            message: `format "${node.format}" is outside the strict-capable subset; remove the format refinement and validate after parsing instead`,
        });
    }
}

function validateObjectShape(
    node: Record<string, unknown>,
    path: string,
    toolName: string,
    violations: StrictToolSchemaViolation[]
): void {
    if (!isObjectSchemaNode(node)) {
        return;
    }

    const properties = isPlainObject(node.properties) ? node.properties : {};
    const required = new Set(
        Array.isArray(node.required)
            ? node.required.filter((key) => typeof key === 'string')
            : []
    );

    for (const key of Object.keys(properties)) {
        if (!required.has(key)) {
            violations.push({
                toolName,
                path: joinPath(path, `properties.${key}`),
                message: `"${key}" is optional; strict schemas require every key — use .nullable() instead of .optional() (note that .default() also makes a key optional)`,
            });
        }
    }

    if (
        'additionalProperties' in node &&
        node.additionalProperties !== false
    ) {
        violations.push({
            toolName,
            path: joinPath(path, 'additionalProperties'),
            message:
                'open objects are not strict-capable; use z.object() with explicit keys instead of z.record(), .catchall(), .passthrough(), or z.looseObject()',
        });
    }
}

function validateRef(
    node: Record<string, unknown>,
    path: string,
    region: string,
    toolName: string,
    violations: StrictToolSchemaViolation[],
    refEdges: Map<string, Set<string>>
): void {
    if (typeof node.$ref !== 'string') {
        return;
    }
    const match = /^#\/(\$defs|definitions)\/([^/]+)$/.exec(node.$ref);
    if (!match) {
        violations.push({
            toolName,
            path: joinPath(path, '$ref'),
            message: `only local references into $defs are strict-capable; found "${node.$ref}"`,
        });
        return;
    }
    const target = `${match[1]}.${match[2]}`;
    const edges = refEdges.get(region) ?? new Set<string>();
    edges.add(target);
    refEdges.set(region, edges);
}

function getDefinitionContainers(
    schema: Record<string, unknown>
): Array<[string, Record<string, unknown>]> {
    const containers: Array<[string, Record<string, unknown>]> = [];
    for (const name of ['$defs', 'definitions'] as const) {
        const value = schema[name];
        if (isPlainObject(value)) {
            containers.push([name, value]);
        }
    }
    return containers;
}

function findCyclicRegions(refEdges: Map<string, Set<string>>): string[] {
    const cyclic = new Set<string>();
    const visiting = new Set<string>();
    const done = new Set<string>();

    function visit(region: string): void {
        if (done.has(region)) {
            return;
        }
        if (visiting.has(region)) {
            cyclic.add(region);
            return;
        }
        visiting.add(region);
        for (const target of refEdges.get(region) ?? []) {
            visit(target);
        }
        visiting.delete(region);
        done.add(region);
    }

    for (const region of refEdges.keys()) {
        visit(region);
    }

    return [...cyclic];
}

function joinPath(path: string, segment: string): string {
    return path === '' ? segment : `${path}.${segment}`;
}
