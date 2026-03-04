import type OpenAI from 'openai';
import type { z } from 'zod';
import type { ChatCompletionChunk } from 'openai/resources/chat/completions/completions';
import type {
    ChatModel,
    GenerateObjectOptions,
    GenerateObjectResult,
    GenerateOptions,
    GenerateResult,
    ObjectStreamEvent,
    StreamObjectOptions,
    StreamObjectResult,
    StreamResult,
} from '@core-ai/core-ai';
import {
    StructuredOutputNoObjectGeneratedError,
    StructuredOutputParseError,
    StructuredOutputValidationError,
    createObjectStreamResult,
    createStreamResult,
} from '@core-ai/core-ai';
import {
    createStructuredOutputOptions,
    createGenerateRequest,
    createStreamRequest,
    getStructuredOutputToolName,
    mapGenerateResponse,
    transformStream,
} from './chat-adapter.js';
import { wrapOpenAIError } from '../openai-error.js';

type OpenAIChatClient = {
    chat: OpenAI['chat'];
};

export function createOpenAICompatChatModel(
    client: OpenAIChatClient,
    modelId: string
): ChatModel {
    const provider = 'openai';

    async function callOpenAIChatCompletionsApi<TResponse>(
        request: unknown
    ): Promise<TResponse> {
        try {
            return (await client.chat.completions.create(
                request as never
            )) as TResponse;
        } catch (error) {
            throw wrapOpenAIError(error);
        }
    }

    async function generateChat(
        options: GenerateOptions
    ): Promise<GenerateResult> {
        const request = createGenerateRequest(modelId, options);
        const response = await callOpenAIChatCompletionsApi<
            Parameters<typeof mapGenerateResponse>[0]
        >(request);
        return mapGenerateResponse(response);
    }

    async function streamChat(options: GenerateOptions): Promise<StreamResult> {
        const request = createStreamRequest(modelId, options);
        const stream = await callOpenAIChatCompletionsApi<
            AsyncIterable<ChatCompletionChunk>
        >(request);
        return createStreamResult(transformStream(stream));
    }

    return {
        provider,
        modelId,
        generate: generateChat,
        stream: streamChat,
        async generateObject<TSchema extends z.ZodType>(
            options: GenerateObjectOptions<TSchema>
        ): Promise<GenerateObjectResult<TSchema>> {
            const structuredOptions = createStructuredOutputOptions(options);
            const result = await generateChat(structuredOptions);
            const toolName = getStructuredOutputToolName(options);
            const object = extractStructuredObject(
                result,
                options.schema,
                provider,
                toolName
            );

            return {
                object,
                finishReason: result.finishReason,
                usage: result.usage,
            };
        },
        async streamObject<TSchema extends z.ZodType>(
            options: StreamObjectOptions<TSchema>
        ): Promise<StreamObjectResult<TSchema>> {
            const structuredOptions = createStructuredOutputOptions(options);
            const stream = await streamChat(structuredOptions);
            const toolName = getStructuredOutputToolName(options);

            return createObjectStreamResult(
                transformStructuredOutputStream(
                    stream,
                    options.schema,
                    provider,
                    toolName
                )
            );
        },
    };
}

function extractStructuredObject<TSchema extends z.ZodType>(
    result: GenerateResult,
    schema: TSchema,
    provider: string,
    toolName: string
): z.infer<TSchema> {
    const structuredToolCall = result.toolCalls.find(
        (toolCall) => toolCall.name === toolName
    );
    if (structuredToolCall) {
        return validateStructuredToolArguments(
            schema,
            structuredToolCall.arguments,
            provider,
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

async function* transformStructuredOutputStream<TSchema extends z.ZodType>(
    stream: StreamResult,
    schema: TSchema,
    provider: string,
    toolName: string
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
            event.toolCall.name === toolName
        ) {
            validatedObject = validateStructuredToolArguments(
                schema,
                event.toolCall.arguments,
                provider,
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
    return validateStructuredObject(schema, parsedPayload, provider, rawPayload);
}

function parseJson(rawOutput: string, provider: string): unknown {
    try {
        return JSON.parse(rawOutput) as unknown;
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
