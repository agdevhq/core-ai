import { ToolSchemaStrictnessError } from './errors.ts';
import { isPlainObject } from './json-schema.ts';
import { getToolJsonSchema, isStandardSchema } from './schema.ts';
import {
    getStrictToolSchemaViolations,
    type StrictToolSchemaViolation,
} from './strict-tool-schema-contract.ts';
import type { ModelCapabilities, ToolDefinition, ToolSet } from './types.ts';

type ContractViolation = Omit<StrictToolSchemaViolation, 'toolName'>;

/**
 * Contract results per Standard Schema instance. Such schemas are immutable
 * and the contract depends on nothing but their JSON Schema, so a tool
 * definition reused across requests is walked once instead of on every call.
 * Keyed by the schema rather than the tool so the tool name can differ.
 * Plain JSON Schema objects are not cached: callers may mutate them between
 * requests.
 */
const contractViolationCache = new WeakMap<
    object,
    readonly ContractViolation[]
>();

function getContractViolations(
    tool: ToolDefinition
): StrictToolSchemaViolation[] {
    const cacheKey = isStandardSchema(tool.parameters)
        ? tool.parameters
        : undefined;
    let cached = cacheKey && contractViolationCache.get(cacheKey);
    if (cached === undefined) {
        cached = getStrictToolSchemaViolations(
            tool.name,
            getToolJsonSchema(tool)
        ).map(({ path, message }) => ({ path, message }));
        if (cacheKey) {
            contractViolationCache.set(cacheKey, cached);
        }
    }
    return cached.map((violation) => ({ toolName: tool.name, ...violation }));
}

export type ValidateToolSchemaStrictnessOptions = {
    tools: ToolSet;
    capabilities: ModelCapabilities;
    providerId: string;
    modelId: string;
};

/**
 * Validates the strict tools of a request before it reaches the provider.
 *
 * Strictness is per-tool opt-in: only tools with `strict: true` are checked.
 * Throws {@link ToolSchemaStrictnessError} when the model is known not to
 * support strict schemas (`unsupported`), when more tools opt in than the
 * model allows (`limit-exceeded`), when a strict tool's schema falls outside
 * the strict-capable schema contract (`invalid-schema`), or when the strict
 * tools have more union-typed parameters than the model allows
 * (`union-limit-exceeded`).
 */
export function validateToolSchemaStrictness({
    tools,
    capabilities,
    providerId,
    modelId,
}: ValidateToolSchemaStrictnessOptions): void {
    const strictTools = Object.values(tools).filter(
        (tool) => tool.strict === true
    );
    if (strictTools.length === 0) {
        return;
    }

    const strictToolNames = strictTools.map((tool) => tool.name);
    const strictCapabilities = capabilities.tools.strictSchemas;

    if (!strictCapabilities.supported) {
        throw new ToolSchemaStrictnessError({
            providerId,
            modelId,
            toolNames: strictToolNames,
            reason: 'unsupported',
        });
    }

    const maxStrictTools = strictCapabilities.maxStrictTools;
    if (maxStrictTools !== undefined && strictTools.length > maxStrictTools) {
        throw new ToolSchemaStrictnessError({
            providerId,
            modelId,
            toolNames: strictToolNames,
            reason: 'limit-exceeded',
            maxStrictTools,
        });
    }

    assertStrictToolSchemaContract(strictTools, { providerId, modelId });

    const maxUnionParameters = strictCapabilities.maxUnionParameters;
    if (maxUnionParameters === undefined) {
        return;
    }
    const unionTools = strictTools.flatMap((tool) => {
        const count = countUnionParameters(getToolJsonSchema(tool));
        return count > 0 ? [{ name: tool.name, count }] : [];
    });
    const unionParameterCount = unionTools.reduce(
        (total, tool) => total + tool.count,
        0
    );
    if (unionParameterCount > maxUnionParameters) {
        throw new ToolSchemaStrictnessError({
            providerId,
            modelId,
            toolNames: unionTools.map((tool) => tool.name),
            reason: 'union-limit-exceeded',
            maxUnionParameters,
            unionParameterCount,
        });
    }
}

/**
 * The union-typed parameters of a strict tool's schema, counted the way
 * Anthropic counts them (live-verified): every property whose schema is an
 * `anyOf` / `oneOf` or a multi-entry `type` array, in nested objects, array
 * items, and `anyOf` branches. Properties of an object whose `type` is an
 * array, unions directly under `items`, `enum`s with `null`, and `$defs`
 * (`$ref` is not followed) do not count.
 */
export function countUnionParameters(schema: unknown): number {
    if (!isPlainObject(schema)) {
        return 0;
    }

    let count = 0;
    if (schema.type === 'object' && isPlainObject(schema.properties)) {
        for (const property of Object.values(schema.properties)) {
            if (isUnionSchema(property)) {
                count += 1;
            }
            count += countUnionParameters(property);
        }
    }
    count += countUnionParameters(schema.items);
    for (const branch of [schema.anyOf, schema.oneOf]) {
        if (Array.isArray(branch)) {
            for (const variant of branch) {
                count += countUnionParameters(variant);
            }
        }
    }
    return count;
}

function isUnionSchema(schema: unknown): boolean {
    return (
        isPlainObject(schema) &&
        ((Array.isArray(schema.type) && schema.type.length > 1) ||
            Array.isArray(schema.anyOf) ||
            Array.isArray(schema.oneOf))
    );
}

/**
 * Throws {@link ToolSchemaStrictnessError} (`invalid-schema`) when a schema of
 * `strictTools` falls outside the strict-capable schema contract, whatever
 * the model supports.
 */
export function assertStrictToolSchemaContract(
    strictTools: readonly ToolDefinition[],
    {
        providerId,
        modelId,
    }: Pick<ValidateToolSchemaStrictnessOptions, 'providerId' | 'modelId'>
): void {
    const violations = strictTools.flatMap(getContractViolations);
    if (violations.length > 0) {
        throw new ToolSchemaStrictnessError({
            providerId,
            modelId,
            toolNames: [...new Set(violations.map((v) => v.toolName))],
            reason: 'invalid-schema',
            violations,
        });
    }
}
