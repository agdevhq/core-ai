import type { GenerateContentResponse } from '@google/genai';
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
    StructuredOutputNoObjectGeneratedError,
    createObjectStream,
    createChatStream,
    finalizeGenerateResult,
    normalizeStructuredOutputSchema,
    parseStructuredOutput,
    validateStructuredOutput,
} from '@core-ai/core-ai';
import {
    createStructuredOutputOptions,
    createGenerateRequest,
    getStructuredOutputToolName,
    mapGenerateResponse,
    transformStream,
} from './chat-adapter.ts';
import { wrapGoogleError } from './google-error.ts';
import { getGoogleModelCapabilities } from './model-capabilities.ts';
import type { GoogleGenAIClient } from './provider.ts';

export function createGoogleGenAIChatModel(
    client: GoogleGenAIClient,
    modelId: string,
    provider = 'google'
): ChatModel {
    const capabilities = getGoogleModelCapabilities(modelId);
    const adapterOptions = { capabilities };

    async function callGenerateContentApi(
        request: unknown
    ): Promise<GenerateContentResponse> {
        try {
            return await client.models.generateContent(request as never);
        } catch (error) {
            throw wrapGoogleError(error, provider);
        }
    }

    async function callGenerateContentStreamApi(
        request: unknown
    ): Promise<AsyncIterable<GenerateContentResponse>> {
        try {
            return await client.models.generateContentStream(request as never);
        } catch (error) {
            throw wrapGoogleError(error, provider);
        }
    }

    async function generateChat(
        options: GenerateOptions
    ): Promise<GenerateResult> {
        const request = createGenerateRequest(
            modelId,
            options,
            provider,
            adapterOptions
        );
        const response = await callGenerateContentApi(request);
        return finalizeGenerateResult(mapGenerateResponse(response), options);
    }

    async function streamChat(options: GenerateOptions): Promise<ChatStream> {
        const request = createGenerateRequest(
            modelId,
            options,
            provider,
            adapterOptions
        );
        return createChatStream(
            async () =>
                transformStream(await callGenerateContentStreamApi(request)),
            {
                signal: options.signal,
                mapError: (error) => wrapGoogleError(error, provider),
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
            const structuredOptions = createStructuredOutputOptions(options);
            const result = await generateChat(structuredOptions);
            const toolName = getStructuredOutputToolName(options);
            const object = await extractStructuredObject(
                result,
                normalizeStructuredOutputSchema(options),
                provider,
                toolName
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
            const structuredOptions = createStructuredOutputOptions(options);
            const stream = await streamChat(structuredOptions);
            const toolName = getStructuredOutputToolName(options);

            return createObjectStream(
                transformStructuredOutputStream<TSchema>(
                    stream,
                    normalizeStructuredOutputSchema(options),
                    provider,
                    toolName
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
    provider: string,
    toolName: string
): Promise<TOutput> {
    const structuredToolCall = result.toolCalls.find(
        (toolCall) => toolCall.name === toolName
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

async function* transformStructuredOutputStream<TSchema extends SchemaInput>(
    stream: ChatStream,
    schema: NormalizedSchema<InferSchemaOutput<TSchema>>,
    provider: string,
    toolName: string
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
            event.toolCall.name === toolName
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
