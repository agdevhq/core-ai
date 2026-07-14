import type {
    GenerateObjectOptions,
    GenerateOptions,
    ToolChoice,
    ToolSet,
} from '@core-ai/core-ai';
import { zodSchemaToJsonSchema } from '@core-ai/core-ai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { z } from 'zod';

export const DEFAULT_STRUCTURED_OUTPUT_TOOL_NAME = 'core_ai_generate_object';

export type OpenAIStructuredOutputFormat = {
    type: 'json_schema';
    name: string;
    description?: string;
    strict: true;
    schema: Record<string, unknown>;
};

/** Internal request options; structuredOutputFormat is not part of public generate/stream APIs. */
export type OpenAIRequestOptions = GenerateOptions & {
    structuredOutputFormat?: OpenAIStructuredOutputFormat;
};

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

export function getStructuredOutputToolName<TSchema extends z.ZodType>(
    options: GenerateObjectOptions<TSchema>
): string {
    return options.schemaName?.trim() || DEFAULT_STRUCTURED_OUTPUT_TOOL_NAME;
}

export function createStructuredOutputRequestOptions<TSchema extends z.ZodType>(
    options: GenerateObjectOptions<TSchema>
): OpenAIRequestOptions {
    return {
        messages: options.messages,
        reasoning: options.reasoning,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        topP: options.topP,
        providerOptions: options.providerOptions,
        signal: options.signal,
        structuredOutputFormat: createOpenAIStructuredOutputFormat(options),
    };
}

function createOpenAIStructuredOutputFormat<TSchema extends z.ZodType>(
    options: GenerateObjectOptions<TSchema>
): OpenAIStructuredOutputFormat {
    const name = getStructuredOutputToolName(options);
    const format = zodTextFormat(
        options.schema,
        name,
        options.schemaDescription
            ? { description: options.schemaDescription }
            : undefined
    );

    return {
        type: 'json_schema',
        name,
        ...(options.schemaDescription
            ? { description: options.schemaDescription }
            : {}),
        strict: true,
        schema: format.schema,
    };
}
