import type { GenerateContentResponse } from '@google/genai';
import type {
    ChatModel,
    GenerateObjectOptions,
    GenerateObjectResult,
    GenerateOptions,
    GenerateResult,
    SchemaInput,
    StreamObjectOptions,
    ObjectStream,
    ChatStream,
} from '@core-ai/core-ai';
import {
    createObjectStream,
    createChatStream,
    extractStructuredObject,
    finalizeGenerateResult,
    normalizeStructuredOutputSchema,
    transformStructuredOutputStream,
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
import { DEFAULT_MAX_RETRIES, withRequestRetry } from './request-retry.ts';

export type GoogleGenAIChatModelOptions = {
    /** Retries of transient request failures; `0` disables them. */
    maxRetries?: number;
};

export function createGoogleGenAIChatModel(
    client: GoogleGenAIClient,
    modelId: string,
    provider = 'google',
    modelOptions: GoogleGenAIChatModelOptions = {}
): ChatModel {
    const capabilities = getGoogleModelCapabilities(modelId);
    const adapterOptions = { capabilities };
    const maxRetries = modelOptions.maxRetries ?? DEFAULT_MAX_RETRIES;

    function withRetries<T>(
        call: () => Promise<T>,
        signal: AbortSignal | undefined
    ): Promise<T> {
        return withRequestRetry(call, {
            maxRetries,
            provider,
            signal,
            wrapError: (error) => wrapGoogleError(error, provider),
        });
    }

    function callGenerateContentApi(
        request: unknown,
        signal: AbortSignal | undefined
    ): Promise<GenerateContentResponse> {
        return withRetries(
            () => client.models.generateContent(request as never),
            signal
        );
    }

    // The SDK resolves this once the response headers arrive, so a retry only
    // ever repeats a request that produced no stream events.
    function callGenerateContentStreamApi(
        request: unknown,
        signal: AbortSignal | undefined
    ): Promise<AsyncIterable<GenerateContentResponse>> {
        return withRetries(
            () => client.models.generateContentStream(request as never),
            signal
        );
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
        const response = await callGenerateContentApi(request, options.signal);
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
                transformStream(
                    await callGenerateContentStreamApi(request, options.signal)
                ),
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
            const structuredOptions = createStructuredOutputOptions(
                options,
                provider
            );
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
            const structuredOptions = createStructuredOutputOptions(
                options,
                provider
            );
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
