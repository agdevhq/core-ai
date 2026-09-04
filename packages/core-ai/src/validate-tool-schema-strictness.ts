import { ToolSchemaStrictnessError } from './errors.ts';
import { zodSchemaToJsonSchema } from './json-schema.ts';
import { getStrictToolSchemaViolations } from './strict-tool-schema-contract.ts';
import type { ModelCapabilities, ToolSet } from './types.ts';

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

    const violations = strictTools.flatMap((tool) =>
        getStrictToolSchemaViolations(
            tool.name,
            zodSchemaToJsonSchema(tool.parameters)
        )
    );
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
