import {
    StructuredOutputNoObjectGeneratedError,
    StructuredOutputParseError,
    StructuredOutputValidationError,
} from './errors.ts';
import { getErrorMessage } from './provider-error-utils.ts';
import { normalizeSchema, type NormalizedSchema } from './schema.ts';
import type { StandardSchemaV1 } from './standard-schema.ts';
import {
    emulateToolDiscoveryMessages,
    validateToolDiscoveryMessages,
    type EmulatedMessage,
} from './tool-discovery.ts';
import type {
    GenerateObjectOptions,
    GenerateResult,
    InferSchemaOutput,
    Message,
    ObjectStreamEvent,
    SchemaInput,
    StreamEvent,
} from './types.ts';

/** The normalized schema of a `generateObject` / `streamObject` request. */
export function normalizeStructuredOutputSchema<TSchema extends SchemaInput>(
    options: Pick<GenerateObjectOptions<TSchema>, 'schema' | 'schemaName'>
): NormalizedSchema<InferSchemaOutput<TSchema>> {
    const name = options.schemaName?.trim();
    return normalizeSchema(
        options.schema,
        name ? `structured output schema "${name}"` : 'structured output schema'
    );
}

/**
 * The messages of a `generateObject` / `streamObject` request. Structured
 * output declares no discovered tools, so the discovery calls and results of
 * the history are validated as on `generate`, except for the strict-capable
 * schema contract, and then sent as ordinary tool calls and results.
 */
export function getStructuredOutputMessages(
    messages: readonly Message[],
    providerId: string
): EmulatedMessage[] {
    validateToolDiscoveryMessages(messages, providerId);
    return emulateToolDiscoveryMessages(messages);
}

/**
 * Returns the structured object of a response to a request that forces a call
 * to the tool `toolName`: the call's arguments, or else the text content
 * parsed as JSON. Validated with {@link validateStructuredOutput}.
 *
 * @throws {StructuredOutputNoObjectGeneratedError} when the response has
 * neither.
 * @throws {StructuredOutputParseError} when the text is not valid JSON.
 * @throws {StructuredOutputValidationError} when validation fails.
 */
export async function extractStructuredObject<TOutput>(
    result: GenerateResult,
    schema: NormalizedSchema<TOutput>,
    provider: string,
    toolName: string
): Promise<TOutput> {
    const toolCall = result.toolCalls.find((call) => call.name === toolName);
    if (toolCall) {
        return validateToolArguments(schema, toolCall.arguments, provider);
    }

    const rawOutput = result.content?.trim();
    if (rawOutput) {
        return parseStructuredOutput(schema, rawOutput, provider);
    }

    throw new StructuredOutputNoObjectGeneratedError(
        'model did not emit a structured object payload',
        provider
    );
}

/**
 * The streaming counterpart of {@link extractStructuredObject}: forwards text
 * and tool argument deltas as `object-delta` events and emits the validated
 * object when the call to `toolName` ends, or else at `finish` from that
 * call's buffered arguments or the text.
 */
export async function* transformStructuredOutputStream<
    TSchema extends SchemaInput,
>(
    stream: AsyncIterable<StreamEvent>,
    schema: NormalizedSchema<InferSchemaOutput<TSchema>>,
    provider: string,
    toolName: string
): AsyncIterable<ObjectStreamEvent<TSchema>> {
    let objectEmitted = false;
    let contentBuffer = '';
    let toolCallId: string | undefined;
    const toolArguments = new Map<string, string>();

    for await (const event of stream) {
        if (event.type === 'text-delta') {
            contentBuffer += event.text;
            yield { type: 'object-delta', text: event.text };
            continue;
        }

        if (event.type === 'tool-call-start' && event.toolName === toolName) {
            toolCallId ??= event.toolCallId;
            continue;
        }

        if (event.type === 'tool-call-delta') {
            toolArguments.set(
                event.toolCallId,
                (toolArguments.get(event.toolCallId) ?? '') +
                    event.argumentsDelta
            );
            yield { type: 'object-delta', text: event.argumentsDelta };
            continue;
        }

        if (
            event.type === 'tool-call-end' &&
            event.toolCall.name === toolName
        ) {
            const object = await validateToolArguments(
                schema,
                event.toolCall.arguments,
                provider
            );
            objectEmitted = true;
            yield { type: 'object', object };
            continue;
        }

        if (event.type === 'finish') {
            if (!objectEmitted) {
                const payload =
                    (toolCallId && toolArguments.get(toolCallId)?.trim()) ||
                    contentBuffer.trim();
                if (!payload) {
                    throw new StructuredOutputNoObjectGeneratedError(
                        'structured output stream ended without an object payload',
                        provider
                    );
                }
                yield {
                    type: 'object',
                    object: await parseStructuredOutput(
                        schema,
                        payload,
                        provider
                    ),
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

function validateToolArguments<TOutput>(
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

/**
 * Parses a structured output payload as JSON and validates it with
 * {@link validateStructuredOutput}.
 *
 * @throws {StructuredOutputParseError} when the payload is not valid JSON.
 * @throws {StructuredOutputValidationError} when validation fails.
 */
export async function parseStructuredOutput<TOutput>(
    schema: NormalizedSchema<TOutput>,
    rawOutput: string,
    provider: string
): Promise<TOutput> {
    let value: unknown;
    try {
        value = JSON.parse(rawOutput);
    } catch (error) {
        throw new StructuredOutputParseError(
            'failed to parse structured output as JSON',
            provider,
            {
                rawOutput,
                cause: error,
            }
        );
    }

    return validateStructuredOutput(schema, value, provider, rawOutput);
}

/**
 * Validates a structured output value with the schema's own validator and
 * returns the schema's output. Plain JSON Schema has no validator, so the
 * value is returned unchanged for the caller to validate.
 *
 * @throws {StructuredOutputValidationError} when validation fails.
 */
export async function validateStructuredOutput<TOutput>(
    schema: NormalizedSchema<TOutput>,
    value: unknown,
    provider: string,
    rawOutput?: string
): Promise<TOutput> {
    if (!schema.validate) {
        // Only plain JSON Schema lacks a validator, and its output type is
        // `unknown`.
        return value as TOutput;
    }

    let result: StandardSchemaV1.Result<TOutput>;
    try {
        result = await schema.validate(value);
    } catch (error) {
        throw new StructuredOutputValidationError(
            'structured output validation threw',
            provider,
            formatSchemaIssues([{ message: getErrorMessage(error) }]),
            {
                rawOutput,
                cause: error,
            }
        );
    }
    if (result.issues === undefined) {
        return result.value;
    }

    throw new StructuredOutputValidationError(
        'structured output does not match schema',
        provider,
        formatSchemaIssues(result.issues),
        {
            rawOutput,
        }
    );
}

/** Formats Standard Schema issues as `path.to.key: message`. */
export function formatSchemaIssues(
    issues: readonly StandardSchemaV1.Issue[]
): string[] {
    return issues.map((issue) => {
        const path =
            issue.path && issue.path.length > 0
                ? issue.path
                      .map((segment) =>
                          String(
                              typeof segment === 'object'
                                  ? segment.key
                                  : segment
                          )
                      )
                      .join('.')
                : '<root>';
        return `${path}: ${issue.message}`;
    });
}
