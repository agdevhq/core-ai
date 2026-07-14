import type Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import type { RawMessageStreamEvent } from '@anthropic-ai/sdk/resources/messages/messages';
import type {
    ChatModel,
    GenerateObjectOptions,
    GenerateObjectResult,
    GenerateOptions,
    GenerateResult,
    ObjectStreamEvent,
    StreamObjectOptions,
    ObjectStream,
    ChatStream,
} from '@core-ai/core-ai';
import {
    StructuredOutputNoObjectGeneratedError,
    StructuredOutputParseError,
    StructuredOutputValidationError,
    createObjectStream,
    createChatStream,
} from '@core-ai/core-ai';
import {
    createStructuredOutputOptions,
    createGenerateRequest,
    createStreamRequest,
    DEFAULT_PROVIDER_ID,
    getAnthropicRequestBetas,
    mapGenerateResponse,
    transformStream,
    wrapError,
} from './chat-adapter.js';
import { getAnthropicModelCapabilities } from './model-capabilities.js';

export type AnthropicChatClient = {
    messages: {
        create: Anthropic['messages']['create'];
    };
};

export type AnthropicChatModelOptions = {
    defaultMaxTokens?: number;
    providerId?: string;
    useStrictToolSchemas?: boolean;
};

export function createAnthropicChatModel(
    client: AnthropicChatClient,
    modelId: string,
    modelOptions: AnthropicChatModelOptions = {}
): ChatModel {
    const defaultMaxTokens = modelOptions.defaultMaxTokens ?? 4096;
    const provider = modelOptions.providerId ?? DEFAULT_PROVIDER_ID;
    const useStrictToolSchemas = modelOptions.useStrictToolSchemas ?? true;

    async function callAnthropicMessagesApi<T>(
        request: unknown,
        betas: string[],
        signal?: AbortSignal
    ): Promise<T> {
        try {
            return (await client.messages.create(request as never, {
                ...(betas.length > 0
                    ? {
                          headers: {
                              'anthropic-beta': betas.join(','),
                          },
                      }
                    : {}),
                signal,
            })) as T;
        } catch (error) {
            throw wrapError(error, provider);
        }
    }

    async function generateChat(
        options: GenerateOptions
    ): Promise<GenerateResult> {
        const request = createGenerateRequest(
            modelId,
            defaultMaxTokens,
            options,
            provider,
            useStrictToolSchemas
        );
        const response = await callAnthropicMessagesApi<
            Parameters<typeof mapGenerateResponse>[0]
        >(request, getAnthropicRequestBetas(modelId, options), options.signal);
        return mapGenerateResponse(response);
    }

    async function streamChat(options: GenerateOptions): Promise<ChatStream> {
        const request = createStreamRequest(
            modelId,
            defaultMaxTokens,
            options,
            provider,
            useStrictToolSchemas
        );
        return createChatStream(
            async () =>
                transformStream(
                    await callAnthropicMessagesApi<
                        AsyncIterable<RawMessageStreamEvent>
                    >(
                        request,
                        getAnthropicRequestBetas(modelId, options),
                        options.signal
                    )
                ),
            { signal: options.signal }
        );
    }

    return {
        provider,
        modelId,
        capabilities: getAnthropicModelCapabilities(modelId),
        generate: generateChat,
        stream: streamChat,
        async generateObject<TSchema extends z.ZodType>(
            options: GenerateObjectOptions<TSchema>
        ): Promise<GenerateObjectResult<TSchema>> {
            const structuredOptions = createStructuredOutputOptions(options);
            const result = await generateChat(structuredOptions);
            const object = extractStructuredObject(
                result,
                options.schema,
                provider
            );

            return {
                object,
                finishReason: result.finishReason,
                usage: result.usage,
            };
        },
        async streamObject<TSchema extends z.ZodType>(
            options: StreamObjectOptions<TSchema>
        ): Promise<ObjectStream<TSchema>> {
            const structuredOptions = createStructuredOutputOptions(options);
            const stream = await streamChat(structuredOptions);

            return createObjectStream(
                transformStructuredOutputStream(
                    stream,
                    options.schema,
                    provider
                ),
                {
                    signal: options.signal,
                }
            );
        },
    };
}

function extractStructuredObject<TSchema extends z.ZodType>(
    result: GenerateResult,
    schema: TSchema,
    provider: string
): z.infer<TSchema> {
    const rawOutput = requireStructuredOutputPayload(
        result.finishReason,
        result.content?.trim(),
        provider,
        'model did not emit a structured object payload'
    );
    return parseAndValidateStructuredObject(schema, rawOutput, provider);
}

async function* transformStructuredOutputStream<TSchema extends z.ZodType>(
    stream: ChatStream,
    schema: TSchema,
    provider: string
): AsyncIterable<ObjectStreamEvent<TSchema>> {
    let contentBuffer = '';

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
            contentBuffer += event.argumentsDelta;
            yield {
                type: 'object-delta',
                text: event.argumentsDelta,
            };
            continue;
        }

        if (event.type === 'finish') {
            const rawOutput = requireStructuredOutputPayload(
                event.finishReason,
                contentBuffer.trim(),
                provider,
                'structured output stream ended without an object payload'
            );
            const validatedObject = parseAndValidateStructuredObject(
                schema,
                rawOutput,
                provider
            );
            yield {
                type: 'object',
                object: validatedObject,
            };

            yield {
                type: 'finish',
                finishReason: event.finishReason,
                usage: event.usage,
            };
        }
    }
}

function requireStructuredOutputPayload(
    finishReason: GenerateResult['finishReason'],
    rawOutput: string | undefined,
    provider: string,
    noPayloadMessage: string
): string {
    if (finishReason === 'content-filter') {
        throw new StructuredOutputNoObjectGeneratedError(
            'model refused to produce a structured output',
            provider,
            {
                rawOutput,
            }
        );
    }

    if (finishReason === 'length') {
        throw new StructuredOutputNoObjectGeneratedError(
            'structured output was truncated because max tokens were reached',
            provider,
            {
                rawOutput,
            }
        );
    }

    if (!rawOutput || rawOutput.length === 0) {
        throw new StructuredOutputNoObjectGeneratedError(
            noPayloadMessage,
            provider
        );
    }

    return rawOutput;
}

function parseAndValidateStructuredObject<TSchema extends z.ZodType>(
    schema: TSchema,
    rawOutput: string,
    provider: string
): z.infer<TSchema> {
    const parsedOutput = parseJson(rawOutput, provider);
    return validateStructuredObject(schema, parsedOutput, provider, rawOutput);
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
