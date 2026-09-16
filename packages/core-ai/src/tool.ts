import type { ToolDefinition } from './types.ts';

export function defineTool<TParameters extends ToolDefinition['parameters']>(
    options: ToolDefinition<TParameters>
): ToolDefinition<TParameters> {
    return options;
}
