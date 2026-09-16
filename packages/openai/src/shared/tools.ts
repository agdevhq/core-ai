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

/**
 * Chat Completions tools. The API is non-strict when `strict` is omitted, so
 * the field is only sent for opted-in tools — this also keeps the wire format
 * unchanged for OpenAI-compatible gateways that predate the field.
 */
export function convertTools(tools: ToolSet, options: ConvertToolsOptions) {
    validateToolSchemaStrictness({ tools, ...options });

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

/**
 * Responses API tools. Unlike Chat Completions, the Responses API tries to
 * normalize a tool into strict mode when `strict` is omitted, so an explicit
 * boolean is always sent to keep "omitted or false means non-strict" true.
 */
export function convertResponseTools(
    tools: ToolSet,
    options: ConvertToolsOptions
) {
    validateToolSchemaStrictness({ tools, ...options });

    return Object.values(tools).map((tool) => ({
        type: 'function' as const,
        name: tool.name,
        description: tool.description,
        parameters: convertToolParameters(tool),
        strict: tool.strict === true,
    }));
}

/**
 * Strict tools get the semantics-preserving strict normalization (OpenAI's
 * strict mode requires closed objects and rejects `$schema`); non-strict
 * tools keep the raw converted schema.
 */
function convertToolParameters(tool: ToolDefinition): Record<string, unknown> {
    const schema = zodSchemaToJsonSchema(tool.parameters);
    return tool.strict === true ? normalizeStrictJsonSchema(schema) : schema;
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
