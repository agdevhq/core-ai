import type {
    ModelCapabilities,
    ToolChoice,
    ToolDefinition,
    ToolSet,
} from '@core-ai/core-ai';
import {
    normalizeStrictJsonSchema,
    validateToolSchemaStrictness,
    zodSchemaToJsonSchema,
} from '@core-ai/core-ai';

export type ConvertToolsOptions = {
    capabilities: ModelCapabilities;
    modelId: string;
    providerId: string;
};

export function convertTools(tools: ToolSet, options: ConvertToolsOptions) {
    validateTools(tools, options);

    return Object.values(tools).map((tool) => ({
        type: 'function' as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters: convertToolParameters(tool),
            ...(tool.strict === true ? { strict: true } : {}),
        },
    }));
}

export function convertResponseTools(
    tools: ToolSet,
    options: ConvertToolsOptions
) {
    validateTools(tools, options);

    return Object.values(tools).map((tool) => ({
        type: 'function' as const,
        name: tool.name,
        description: tool.description,
        parameters: convertToolParameters(tool),
        ...(tool.strict === true ? { strict: true } : {}),
    }));
}

/**
 * Strict tools get the semantics-preserving strict normalization (OpenAI's
 * strict mode requires closed objects and rejects `$schema`); non-strict
 * tools keep the raw converted schema.
 */
function convertToolParameters(
    tool: ToolDefinition
): Record<string, unknown> {
    const schema = zodSchemaToJsonSchema(tool.parameters);
    return tool.strict === true ? normalizeStrictJsonSchema(schema) : schema;
}

function validateTools(tools: ToolSet, options: ConvertToolsOptions): void {
    validateToolSchemaStrictness({
        tools,
        capabilities: options.capabilities,
        providerId: options.providerId,
        modelId: options.modelId,
    });
}

export function convertToolChoice(choice: ToolChoice) {
    if (typeof choice === 'string') {
        return choice;
    }

    return {
        type: 'function' as const,
        function: {
            name: choice.toolName,
        },
    };
}
