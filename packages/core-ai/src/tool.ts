import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolDefinition, ToolSet } from './types.ts';

export function defineTool(options: ToolDefinition): ToolDefinition {
    return options;
}

export type JsonSchemaTool = {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
};

export function toolSetToJsonSchemas(
    tools: ToolSet | undefined
): JsonSchemaTool[] {
    if (!tools) {
        return [];
    }

    return Object.values(tools).map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: zodToJsonSchema(tool.parameters) as Record<string, unknown>,
    }));
}
