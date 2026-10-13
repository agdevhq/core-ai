import type Anthropic from '@anthropic-ai/sdk';
import type { RawMessageStreamEvent } from '@anthropic-ai/sdk/resources/messages/messages';
import type {
    ChatModel,
    GenerateObjectOptions,
    GenerateObjectResult,
    GenerateOptions,
    GenerateResult,
    InferSchemaOutput,
    NormalizedSchema,
    ObjectStreamEvent,
    SchemaInput,
    StreamObjectOptions,
    ObjectStream,
    ChatStream,
} from '@core-ai/core-ai';
import {
    AbortedError,
    StreamAbortedError,
    StructuredOutputNoObjectGeneratedError,
    createObjectStream,
    createChatStream,
    normalizeStructuredOutputSchema,
    parseStructuredOutput,
} from '@core-ai/core-ai';
import {
    createStructuredOutputOptions,
    createStreamRequest,
    DEFAULT_PROVIDER_ID,
    getAnthropicRequestBetas,
    transformStream,
    wrapAnthropicError,
} from './chat-adapter.ts';
import { getAnthropicModelCapabilities } from './model-capabilities.ts';

export type AnthropicChatClient = {
    messages: {
        create: Anthropic['messages']['create'];
    };
};

export type AnthropicChatModelOptions = {
    /** Overrides the model's output ceiling as the default `max_tokens`. */
    defaultMaxTokens?: number;
    providerId?: string;
};

export function createAnthropicChatModel(
    client: AnthropicChatClient,
    modelId: string,
    modelOptions: AnthropicChatModelOptions = {}
): ChatModel {
    const { defaultMaxTokens } = modelOptions;
    const provider = modelOptions.providerId ?? DEFAULT_PROVIDER_ID;
    const capabilities = getAnthropicModelCapabilities(modelId);
    const adapterOptions = { capabilities };

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
            throw wrapAnthropicError(error, provider);
        }
    }

    // Always streams; see createStreamRequest for why.
    async function generateChat(
        options: GenerateOptions
    ): Promise<GenerateResult> {
        const stream = await streamChat(options);
        try {
            return await stream.result;
        } catch (error) {
            if (error instanceof StreamAbortedError) {
                throw new AbortedError(error, provider);
            }
            throw error;
        }
    }

    async function streamChat(options: GenerateOptions): Promise<ChatStream> {
        const request = createStreamRequest(
            modelId,
            defaultMaxTokens,
            options,
            provider,
            adapterOptions
        );
        return createChatStream(
            async () =>
                transformStream(
                    await callAnthropicMessagesApi<
                        AsyncIterable<RawMessageStreamEvent>
                    >(
                        request,
                        getAnthropicRequestBetas(modelId, options, provider),
                        options.signal
                    )
                ),
            {
                signal: options.signal,
                mapError: (error) => wrapAnthropicError(error, provider),
                request: options,
            }
        );
    }

    return {
        provider,
        modelId,
        capabilities,
        generate: generateChat,
        stream: streamChat,
        async generateObject<TSchema extends SchemaInput>(
            options: GenerateObjectOptions<TSchema>
        ): Promise<GenerateObjectResult<TSchema>> {
            const schema = normalizeStructuredOutputSchema(options);
            const structuredOptions = createStructuredOutputOptions(
                options,
                provider
            );
            const result = await generateChat(structuredOptions);
            const object = await extractStructuredObject(
                result,
                schema,
                provider
            );

            return {
                object,
                finishReason: result.finishReason,
                usage: result.usage,
            };
        },
        async streamObject<TSchema extends SchemaInput>(
            options: StreamObjectOptions<TSchema>
        ): Promise<ObjectStream<TSchema>> {
            const schema = normalizeStructuredOutputSchema(options);
            const structuredOptions = createStructuredOutputOptions(
                options,
                provider
            );
            const stream = await streamChat(structuredOptions);

            return createObjectStream(
                transformStructuredOutputStream<TSchema>(
                    stream,
                    schema,
                    provider
                ),
                {
                    signal: options.signal,
                }
            );
        },
    };
}

function extractStructuredObject<TOutput>(
    result: GenerateResult,
    schema: NormalizedSchema<TOutput>,
    provider: string
): Promise<TOutput> {
    const rawOutput = requireStructuredOutputPayload(
        result.finishReason,
        result.content?.trim(),
        provider,
        'model did not emit a structured object payload'
    );
    return parseStructuredOutput(schema, rawOutput, provider);
}

async function* transformStructuredOutputStream<TSchema extends SchemaInput>(
    stream: ChatStream,
    schema: NormalizedSchema<InferSchemaOutput<TSchema>>,
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
            const validatedObject = await parseStructuredOutput(
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
