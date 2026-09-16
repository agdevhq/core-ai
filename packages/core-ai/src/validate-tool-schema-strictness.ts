import type { z } from 'zod';

import { ToolSchemaStrictnessError } from './errors.ts';
import { zodSchemaToJsonSchema } from './json-schema.ts';
import {
    getStrictToolSchemaViolations,
    type StrictToolSchemaViolation,
} from './strict-tool-schema-contract.ts';
import type { ModelCapabilities, ToolDefinition, ToolSet } from './types.ts';

type ContractViolation = Omit<StrictToolSchemaViolation, 'toolName'>;

/**
 * Contract results per Zod schema instance. Zod schemas are immutable and the
 * contract depends on nothing but the serialized schema, so a tool definition
 * reused across requests is serialized and walked once instead of on every
 * call. Keyed by the schema rather than the tool so the tool name can differ.
 */
const contractViolationCache = new WeakMap<
    z.ZodType,
    readonly ContractViolation[]
>();

function getContractViolations(
    tool: ToolDefinition
): StrictToolSchemaViolation[] {
    let cached = contractViolationCache.get(tool.parameters);
    if (cached === undefined) {
        cached = getStrictToolSchemaViolations(
            tool.name,
            zodSchemaToJsonSchema(tool.parameters)
        ).map(({ path, message }) => ({ path, message }));
        contractViolationCache.set(tool.parameters, cached);
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
