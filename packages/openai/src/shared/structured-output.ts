import type { JSONSchema } from 'openai/lib/jsonschema';
import { toStrictJsonSchema } from 'openai/lib/transform';
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
    asObject,
    getErrorMessage,
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
        const format = createOpenAIStructuredOutputFormat(options, provider);
        const description =
            format.description ?? DEFAULT_STRUCTURED_OUTPUT_DESCRIPTION;
        const instruction = [
            'Return only a valid JSON object.',
            `Schema name: ${format.name}.`,
            `Description: ${description}`,
            `JSON Schema: ${JSON.stringify(format.schema)}`,
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
 * Structured Outputs requires a strict schema: closed objects whose keys are
 * all required. Optional keys that also accept `null` or declare a `default`
 * become required, so the model always supplies them with a value the schema
 * accepts; other optional keys are rejected here rather than by the API.
 */
function toOpenAIStrictJsonSchema(
    schema: JsonSchema,
    name: string,
    provider: string
): JsonSchema {
    try {
        return toStrictJsonSchema(
            requireDefaultedKeys(
                normalizeStrictJsonSchema(schema)
            ) as JSONSchema
        ) as JsonSchema;
    } catch (error) {
        throw new ValidationError(
            `structured output schema "${name}" cannot be sent as an OpenAI strict JSON Schema: ${getErrorMessage(error)}`,
            error,
            provider
        );
    }
}

/**
 * Zod's input schema leaves `.default()` keys optional. Requiring them keeps
 * the schema the model sees as it was before Standard Schema support, when
 * these keys were serialized from the output type.
 */
function requireDefaultedKeys(node: JsonSchema): JsonSchema {
    const result = mapChildSchemaNodes(node, (child) =>
        child !== null && typeof child === 'object' && !Array.isArray(child)
            ? requireDefaultedKeys(asObject(child))
            : child
    );
    const properties = asObject(result.properties);
    const required = Array.isArray(result.required) ? result.required : [];
    const defaultedKeys = Object.keys(properties).filter(
        (key) =>
            !required.includes(key) &&
            Object.hasOwn(asObject(properties[key]), 'default')
    );

    return defaultedKeys.length > 0
        ? { ...result, required: [...required, ...defaultedKeys] }
        : result;
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
