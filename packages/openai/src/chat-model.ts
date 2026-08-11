import type OpenAI from 'openai';
import type { z } from 'zod';
import type {
    Response,
    ResponseCreateParamsNonStreaming,
    ResponseCreateParamsStreaming,
    ResponseStreamEvent,
} from 'openai/resources/responses/responses';
import type {
    ChatModel,
    GenerateObjectOptions,
    GenerateObjectResult,
    GenerateResult,
    ModelCapabilities,
    StreamObjectOptions,
    ObjectStream,
    ChatStream,
} from '@core-ai/core-ai';
import { createObjectStream, createChatStream } from '@core-ai/core-ai';
import {
    createGenerateRequest,
    createStreamRequest,
    DEFAULT_PROVIDER_ID,
    mapGenerateResponse,
    transformStream,
} from './chat-adapter.js';
import { wrapOpenAIError } from './openai-error.js';
import {
    createStructuredOutputRequestOptions,
    extractStructuredObject,
    getStructuredOutputName,
    transformStructuredOutputStream,
    type OpenAIRequestOptions,
} from './shared/structured-output.js';

type OpenAIChatClient = {
    responses: OpenAI['responses'];
};

export function createOpenAIChatModel(
    client: OpenAIChatClient,
    modelId: string,
    capabilities: ModelCapabilities,
    providerId = DEFAULT_PROVIDER_ID
): ChatModel {
    const provider = providerId;
    const adapterOptions = { capabilities, providerId };

    async function callOpenAIResponsesApi<TResponse>(
        request:
            | ResponseCreateParamsNonStreaming
            | ResponseCreateParamsStreaming,
        signal?: AbortSignal
    ): Promise<TResponse> {
        try {
            return (await client.responses.create(request as never, {
                signal,
            })) as TResponse;
        } catch (error) {
            throw wrapOpenAIError(error, provider);
        }
    }

    async function generateChat(
        options: OpenAIRequestOptions
    ): Promise<GenerateResult> {
        const request = createGenerateRequest(modelId, options, adapterOptions);
        const response = await callOpenAIResponsesApi<Response>(
            request,
            options.signal
        );
        return mapGenerateResponse(response, {
            providerMetadataKey: provider,
        });
    }

    async function streamChat(
        options: OpenAIRequestOptions
    ): Promise<ChatStream> {
        const request = createStreamRequest(modelId, options, adapterOptions);
        return createChatStream(
            async () =>
                transformStream(
                    await callOpenAIResponsesApi<
                        AsyncIterable<ResponseStreamEvent>
                    >(request, options.signal),
                    { providerMetadataKey: provider }
                ),
            { signal: options.signal }
        );
    }

    return {
        provider,
        modelId,
        capabilities,
        generate: generateChat,
        stream: streamChat,
        async generateObject<TSchema extends z.ZodType>(
            options: GenerateObjectOptions<TSchema>
        ): Promise<GenerateObjectResult<TSchema>> {
            const structuredOptions =
                createStructuredOutputRequestOptions(options);
            const result = await generateChat(structuredOptions);
            const structuredOutputName = getStructuredOutputName(options);
            const object = extractStructuredObject(
                result,
                options.schema,
                provider,
                structuredOutputName
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
            const structuredOptions =
                createStructuredOutputRequestOptions(options);
            const stream = await streamChat(structuredOptions);
            const structuredOutputName = getStructuredOutputName(options);

            return createObjectStream(
                transformStructuredOutputStream(
                    stream,
                    options.schema,
                    provider,
                    structuredOutputName
                ),
                {
                    signal: options.signal,
                }
            );
        },
    };
}
