import { ToolSchemaStrictnessError } from './errors.ts';
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
 * model allows (`limit-exceeded`), or when a strict tool's schema falls
 * outside the strict-capable schema contract (`invalid-schema`).
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
