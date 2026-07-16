import type { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import type {
    ChatStream,
    GenerateObjectOptions,
    GenerateOptions,
    GenerateResult,
    ObjectStreamEvent,
} from '@core-ai/core-ai';
import {
    StructuredOutputNoObjectGeneratedError,
    StructuredOutputParseError,
    StructuredOutputValidationError,
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

export function getStructuredOutputName<TSchema extends z.ZodType>(
    options: GenerateObjectOptions<TSchema>
): string {
    return options.schemaName?.trim() || DEFAULT_STRUCTURED_OUTPUT_NAME;
}

export function createStructuredOutputRequestOptions<TSchema extends z.ZodType>(
    options: GenerateObjectOptions<TSchema>,
    mode: OpenAIStructuredOutputMode = 'json-schema'
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
                    parameters: options.schema,
                },
            },
            toolChoice: {
                type: 'tool',
                toolName: name,
            },
        };
    }

    if (mode === 'json-object') {
        const format = createOpenAIStructuredOutputFormat(options);
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
        structuredOutputFormat: createOpenAIStructuredOutputFormat(options),
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

function createOpenAIStructuredOutputFormat<TSchema extends z.ZodType>(
    options: GenerateObjectOptions<TSchema>
): Extract<OpenAIStructuredOutputFormat, { type: 'json_schema' }> {
    const name = getStructuredOutputName(options);
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

export function extractStructuredObject<TSchema extends z.ZodType>(
    result: GenerateResult,
    schema: TSchema,
    provider: string,
    structuredOutputName: string
): z.infer<TSchema> {
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
        return parseAndValidateStructuredPayload(schema, rawOutput, provider);
    }

    throw new StructuredOutputNoObjectGeneratedError(
        'model did not emit a structured object payload',
        provider
    );
}

export async function* transformStructuredOutputStream<
    TSchema extends z.ZodType,
>(
    stream: ChatStream,
    schema: TSchema,
    provider: string,
    structuredOutputName: string
): AsyncIterable<ObjectStreamEvent<TSchema>> {
    let validatedObject: z.infer<TSchema> | undefined;
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
            validatedObject = validateStructuredToolArguments(
                schema,
                event.toolCall.arguments,
                provider
            );
            yield {
                type: 'object',
                object: validatedObject,
            };
            continue;
        }

        if (event.type === 'finish') {
            if (validatedObject === undefined) {
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

                validatedObject = parseAndValidateStructuredPayload(
                    schema,
                    fallbackPayload,
                    provider
                );
                yield {
                    type: 'object',
                    object: validatedObject,
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

function validateStructuredToolArguments<TSchema extends z.ZodType>(
    schema: TSchema,
    toolArguments: Record<string, unknown>,
    provider: string
): z.infer<TSchema> {
    return validateStructuredObject(
        schema,
        toolArguments,
        provider,
        JSON.stringify(toolArguments)
    );
}

function parseAndValidateStructuredPayload<TSchema extends z.ZodType>(
    schema: TSchema,
    rawPayload: string,
    provider: string
): z.infer<TSchema> {
    const parsedPayload = parseJson(rawPayload, provider);
    return validateStructuredObject(
        schema,
        parsedPayload,
        provider,
        rawPayload
    );
}

function parseJson(rawOutput: string, provider: string): unknown {
    try {
        return JSON.parse(rawOutput);
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
}

function validateStructuredObject<TSchema extends z.ZodType>(
    schema: TSchema,
    value: unknown,
    provider: string,
    rawOutput?: string
): z.infer<TSchema> {
    const parsed = schema.safeParse(value);
    if (parsed.success) {
        return parsed.data;
    }

    throw new StructuredOutputValidationError(
        'structured output does not match schema',
        provider,
        formatZodIssues(parsed.error.issues),
        {
            rawOutput,
        }
    );
}

function formatZodIssues(issues: z.ZodIssue[]): string[] {
    return issues.map((issue) => {
        const path =
            issue.path.length > 0
                ? issue.path.map((segment) => String(segment)).join('.')
                : '<root>';
        return `${path}: ${issue.message}`;
    });
}
