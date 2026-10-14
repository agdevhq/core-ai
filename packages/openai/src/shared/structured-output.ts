import type {
    ChatStream,
    GenerateObjectOptions,
    GenerateOptions,
    GenerateResult,
    InferSchemaOutput,
    JsonSchema,
    NormalizedSchema,
    ObjectStreamEvent,
    SchemaInput,
} from '@core-ai/core-ai';
import {
    mapChildSchemaNodes,
    normalizeStrictJsonSchema,
    normalizeStructuredOutputSchema,
    parseStructuredOutput,
    StructuredOutputNoObjectGeneratedError,
    validateStructuredOutput,
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

/**
 * The tool mode declares the schema as plain JSON Schema, so the generated
 * call is validated once, by {@link extractStructuredObject}, instead of also
 * as an ordinary tool call.
 */
export function createStructuredOutputRequestOptions<
    TSchema extends SchemaInput,
>(
    options: GenerateObjectOptions<TSchema>,
    mode: OpenAIStructuredOutputMode = 'json-schema',
    provider = 'openai'
): OpenAIRequestOptions {
    const baseOptions: GenerateOptions = {
        messages: options.messages,
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
        if (schema.type !== 'object') {
            throw new ValidationError(
                `structured output schema "${name}" must be an object schema (type: "object"), because JSON mode always returns an object`,
                undefined,
                provider
            );
        }
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
                options.messages,
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
 * objects whose keys are all required. On top of
 * {@link normalizeStrictJsonSchema}, optional keys that accept `null` or
 * declare a `default` become required, so the model always supplies a value
 * the schema accepts. (Zod's input schema leaves `.default()` keys optional.)
 * Any other optional key is rejected here, by path, rather than by the API.
 */
function toOpenAIStrictJsonSchema(
    schema: JsonSchema,
    name: string,
    provider: string
): JsonSchema {
    const normalized = normalizeStrictJsonSchema(schema);
    if (normalized.type !== 'object') {
        throw createStrictSchemaError(
            name,
            'the root must be an object schema (type: "object")',
            provider
        );
    }

    const optionalKeyPaths: string[] = [];
    const strict = requireEveryKey(normalized, '', optionalKeyPaths);
    if (optionalKeyPaths.length > 0) {
        throw createStrictSchemaError(
            name,
            `optional keys at ${optionalKeyPaths.join(', ')}; strict mode requires every key, so make each one required or let it accept null (e.g. Zod's .nullable())`,
            provider
        );
    }

    return strict;
}

function requireEveryKey(
    node: JsonSchema,
    path: string,
    optionalKeyPaths: string[]
): JsonSchema {
    if (isPlainObject(node.properties)) {
        const required = Array.isArray(node.required) ? node.required : [];
        for (const [key, property] of Object.entries(node.properties)) {
            if (
                !required.includes(key) &&
                !acceptsNull(property) &&
                !(isPlainObject(property) && Object.hasOwn(property, 'default'))
            ) {
                optionalKeyPaths.push(
                    joinSchemaPath(path, `properties.${key}`)
                );
            }
        }
    }

    const result = mapChildSchemaNodes(node, (child, segment) =>
        isPlainObject(child)
            ? requireEveryKey(
                  child,
                  joinSchemaPath(path, segment),
                  optionalKeyPaths
              )
            : child
    );
    // A `null` default adds nothing once a nullable key is required.
    if (result.default === null) {
        delete result.default;
    }

    return isPlainObject(result.properties)
        ? { ...result, required: Object.keys(result.properties) }
        : result;
}

function acceptsNull(schema: unknown): boolean {
    if (!isPlainObject(schema)) {
        return false;
    }
    if (
        schema.type === 'null' ||
        (Array.isArray(schema.type) && schema.type.includes('null'))
    ) {
        return true;
    }
    return [schema.anyOf, schema.oneOf].some(
        (branches) => Array.isArray(branches) && branches.some(acceptsNull)
    );
}

function createStrictSchemaError(
    name: string,
    reason: string,
    provider: string
): ValidationError {
    return new ValidationError(
        `structured output schema "${name}" cannot be sent as an OpenAI strict JSON Schema: ${reason}`,
        undefined,
        provider
    );
}

function joinSchemaPath(path: string, segment: string): string {
    return path === '' ? segment : `${path}.${segment}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function extractStructuredObject<TOutput>(
    result: GenerateResult,
    schema: NormalizedSchema<TOutput>,
    provider: string,
    structuredOutputName: string
): Promise<TOutput> {
    const structuredToolCall = result.toolCalls.find(
        (toolCall) => toolCall.name === structuredOutputName
    );
    if (structuredToolCall) {
        return validateStructuredToolArguments(
            schema,
            structuredToolCall.arguments,
            provider
        );
    }

    const rawOutput = result.content?.trim();
    if (rawOutput && rawOutput.length > 0) {
        return parseStructuredOutput(schema, rawOutput, provider);
    }

    throw new StructuredOutputNoObjectGeneratedError(
        'model did not emit a structured object payload',
        provider
    );
}

export async function* transformStructuredOutputStream<
    TSchema extends SchemaInput,
>(
    stream: ChatStream,
    schema: NormalizedSchema<InferSchemaOutput<TSchema>>,
    provider: string,
    structuredOutputName: string
): AsyncIterable<ObjectStreamEvent<TSchema>> {
    let validated: { object: InferSchemaOutput<TSchema> } | undefined;
    let contentBuffer = '';
    const toolArgumentDeltas = new Map<string, string>();

    for await (const event of stream) {
        if (event.type === 'text-delta') {
            contentBuffer += event.text;
            yield {
                type: 'object-delta',
                text: event.text,
            };
            continue;
        }

        if (event.type === 'tool-call-delta') {
            const previous = toolArgumentDeltas.get(event.toolCallId) ?? '';
            toolArgumentDeltas.set(
                event.toolCallId,
                `${previous}${event.argumentsDelta}`
            );

            yield {
                type: 'object-delta',
                text: event.argumentsDelta,
            };
            continue;
        }

        if (
            event.type === 'tool-call-end' &&
            event.toolCall.name === structuredOutputName
        ) {
            validated = {
                object: await validateStructuredToolArguments(
                    schema,
                    event.toolCall.arguments,
                    provider
                ),
            };
            yield {
                type: 'object',
                object: validated.object,
            };
            continue;
        }

        if (event.type === 'finish') {
            if (validated === undefined) {
                const fallbackPayload = getFallbackStructuredPayload(
                    contentBuffer,
                    toolArgumentDeltas
                );

                if (!fallbackPayload) {
                    throw new StructuredOutputNoObjectGeneratedError(
                        'structured output stream ended without an object payload',
                        provider
                    );
                }

                validated = {
                    object: await parseStructuredOutput(
                        schema,
                        fallbackPayload,
                        provider
                    ),
                };
                yield {
                    type: 'object',
                    object: validated.object,
                };
            }

            yield {
                type: 'finish',
                finishReason: event.finishReason,
                usage: event.usage,
            };
        }
    }
}

function getFallbackStructuredPayload(
    contentBuffer: string,
    toolArgumentDeltas: Map<string, string>
): string | undefined {
    for (const delta of toolArgumentDeltas.values()) {
        const trimmed = delta.trim();
        if (trimmed.length > 0) {
            return trimmed;
        }
    }

    const trimmedContent = contentBuffer.trim();
    if (trimmedContent.length > 0) {
        return trimmedContent;
    }

    return undefined;
}

function validateStructuredToolArguments<TOutput>(
    schema: NormalizedSchema<TOutput>,
    toolArguments: Record<string, unknown>,
    provider: string
): Promise<TOutput> {
    return validateStructuredOutput(
        schema,
        toolArguments,
        provider,
        JSON.stringify(toolArguments)
    );
}
