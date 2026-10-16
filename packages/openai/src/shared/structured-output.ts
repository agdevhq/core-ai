import type {
    GenerateObjectOptions,
    GenerateOptions,
    JsonSchema,
    SchemaInput,
} from '@core-ai/core-ai';
import {
    getStructuredOutputMessages,
    normalizeStrictJsonSchema,
    normalizeStructuredOutputSchema,
    requireEveryKey,
    ValidationError,
} from '@core-ai/core-ai';

const DEFAULT_STRUCTURED_OUTPUT_NAME = 'core_ai_generate_object';
const DEFAULT_STRUCTURED_OUTPUT_DESCRIPTION =
    'Return a JSON object that matches the requested schema.';

export type OpenAIStructuredOutputMode = 'json-schema' | 'tool' | 'json-object';

type OpenAIStructuredOutputFormat =
    | {
          type: 'json_schema';
          name: string;
          description?: string;
          strict: true;
          schema: Record<string, unknown>;
      }
    | {
          type: 'json_object';
      };

/** Internal request options; structured output is not part of public generate/stream APIs. */
export type OpenAIRequestOptions = GenerateOptions & {
    structuredOutputFormat?: OpenAIStructuredOutputFormat;
};

export function getStructuredOutputName<TSchema extends SchemaInput>(
    options: GenerateObjectOptions<TSchema>
): string {
    return options.schemaName?.trim() || DEFAULT_STRUCTURED_OUTPUT_NAME;
}

export function createStructuredOutputRequestOptions<
    TSchema extends SchemaInput,
>(
    options: GenerateObjectOptions<TSchema>,
    provider: string,
    mode: OpenAIStructuredOutputMode = 'json-schema'
): OpenAIRequestOptions {
    const baseOptions: GenerateOptions = {
        messages: getStructuredOutputMessages(options.messages, provider),
        reasoning: options.reasoning,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        topP: options.topP,
        providerOptions: options.providerOptions,
        signal: options.signal,
    };

    if (mode === 'tool') {
        const name = getStructuredOutputName(options);
        return {
            ...baseOptions,
            tools: {
                structured_output: {
                    name,
                    description:
                        options.schemaDescription ??
                        DEFAULT_STRUCTURED_OUTPUT_DESCRIPTION,
                    parameters:
                        normalizeStructuredOutputSchema(options).jsonSchema,
                },
            },
            toolChoice: {
                type: 'tool',
                toolName: name,
            },
        };
    }

    if (mode === 'json-object') {
        // The provider enforces only JSON syntax here, so the schema is shown
        // as is, optional keys included, rather than in its strict form.
        const name = getStructuredOutputName(options);
        const { $schema: _schema, ...schema } =
            normalizeStructuredOutputSchema(options).jsonSchema;
        assertObjectRoot(schema, name, provider);
        const instruction = [
            'Return only a valid JSON object.',
            `Schema name: ${name}.`,
            `Description: ${options.schemaDescription || DEFAULT_STRUCTURED_OUTPUT_DESCRIPTION}`,
            `JSON Schema: ${JSON.stringify(schema)}`,
            'Do not include markdown, prose, or any text outside the JSON object.',
        ].join('\n');

        return {
            ...baseOptions,
            messages: insertStructuredOutputSystemMessage(
                baseOptions.messages,
                instruction
            ),
            structuredOutputFormat: {
                type: 'json_object',
            },
        };
    }

    return {
        ...baseOptions,
        structuredOutputFormat: createOpenAIStructuredOutputFormat(
            options,
            provider
        ),
    };
}

function insertStructuredOutputSystemMessage(
    messages: GenerateOptions['messages'],
    content: string
): GenerateOptions['messages'] {
    const firstNonSystemMessageIndex = messages.findIndex(
        (message) => message.role !== 'system'
    );
    const insertionIndex =
        firstNonSystemMessageIndex === -1
            ? messages.length
            : firstNonSystemMessageIndex;

    return [
        ...messages.slice(0, insertionIndex),
        { role: 'system', content },
        ...messages.slice(insertionIndex),
    ];
}

function createOpenAIStructuredOutputFormat<TSchema extends SchemaInput>(
    options: GenerateObjectOptions<TSchema>,
    provider: string
): Extract<OpenAIStructuredOutputFormat, { type: 'json_schema' }> {
    const name = getStructuredOutputName(options);

    return {
        type: 'json_schema',
        name,
        ...(options.schemaDescription
            ? { description: options.schemaDescription }
            : {}),
        strict: true,
        schema: toOpenAIStrictJsonSchema(
            normalizeStructuredOutputSchema(options).jsonSchema,
            name,
            provider
        ),
    };
}

/**
 * Structured Outputs requires a strict schema: an object root and closed
 * objects whose keys are all required. Optional keys that accept `null` or
 * declare a `default` are required as is (Zod's input schema leaves
 * `.default()` keys optional); any other optional key is rejected here, by
 * path, rather than by the API.
 */
function toOpenAIStrictJsonSchema(
    schema: JsonSchema,
    name: string,
    provider: string
): JsonSchema {
    assertObjectRoot(schema, name, provider);

    const strict = requireEveryKey(normalizeStrictJsonSchema(schema));
    if (strict.optionalKeyPaths.length > 0) {
        throw new ValidationError(
            `structured output schema "${name}" cannot be sent as an OpenAI strict JSON Schema: optional keys at ${strict.optionalKeyPaths.join(', ')}; strict mode requires every key, so make each one required, let it accept null (e.g. Zod's .nullable()), or give it a default`,
            undefined,
            provider
        );
    }

    return strict.schema;
}

/** JSON mode and strict mode both return a JSON object. */
function assertObjectRoot(
    schema: JsonSchema,
    name: string,
    provider: string
): void {
    if (schema.type !== 'object') {
        throw new ValidationError(
            `structured output schema "${name}" must be an object schema (type: "object")`,
            undefined,
            provider
        );
    }
}
