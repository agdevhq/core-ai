import type { ToolChoice, ToolSet } from '@core-ai/core-ai';
import { zodSchemaToJsonSchema } from '@core-ai/core-ai';

export function convertTools(tools: ToolSet) {
    return Object.values(tools).map((tool) => ({
        type: 'function' as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters: zodSchemaToJsonSchema(tool.parameters),
        },
    }));
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
