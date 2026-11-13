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
import {
    getGoogleModelCapabilities,
    type GooglePlatform,
} from './model-capabilities.ts';
import type { GoogleGenAIClient } from './provider.ts';

export function createGoogleGenAIChatModel(
    client: GoogleGenAIClient,
    modelId: string,
    provider = 'google',
    platform: GooglePlatform = 'gemini-api'
): ChatModel {
    const capabilities = getGoogleModelCapabilities(modelId, platform);
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
