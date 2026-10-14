import type OpenAI from 'openai';
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
    SchemaInput,
    StreamObjectOptions,
    ObjectStream,
    ChatStream,
} from '@core-ai/core-ai';
import {
    createObjectStream,
    createChatStream,
    extractStructuredObject,
    normalizeStructuredOutputSchema,
    transformStructuredOutputStream,
} from '@core-ai/core-ai';
import {
    createGenerateRequest,
    createStreamRequest,
    DEFAULT_PROVIDER_ID,
    mapGenerateResponse,
    transformStream,
} from './chat-adapter.ts';
import { wrapOpenAIError } from './openai-error.ts';
import type { OpenAIResponsesGenerateProviderOptionsConfig } from './provider-options.ts';
import {
    createStructuredOutputRequestOptions,
    getStructuredOutputName,
    type OpenAIRequestOptions,
} from './shared/structured-output.ts';

type OpenAIChatClient = {
    responses: OpenAI['responses'];
};

type OpenAIResponsesModelOptions = {
    providerId?: string;
    providerOptions?: OpenAIResponsesGenerateProviderOptionsConfig;
};

export function createOpenAIChatModel(
    client: OpenAIChatClient,
    modelId: string,
    capabilities: ModelCapabilities,
    modelOptions: OpenAIResponsesModelOptions = {}
): ChatModel {
    const provider = modelOptions.providerId ?? DEFAULT_PROVIDER_ID;
    const adapterOptions = {
        capabilities,
        providerId: provider,
        providerOptions: modelOptions.providerOptions,
    };

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
        try {
            return mapGenerateResponse(response, { providerId: provider });
        } catch (error) {
            throw wrapOpenAIError(error, provider);
        }
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
                    { providerId: provider }
                ),
            {
                signal: options.signal,
                mapError: (error) => wrapOpenAIError(error, provider),
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
            const structuredOptions = createStructuredOutputRequestOptions(
                options,
                provider
            );
            const result = await generateChat(structuredOptions);
            const structuredOutputName = getStructuredOutputName(options);
            const object = await extractStructuredObject(
                result,
                normalizeStructuredOutputSchema(options),
                provider,
                structuredOutputName
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
            const structuredOptions = createStructuredOutputRequestOptions(
                options,
                provider
            );
            const stream = await streamChat(structuredOptions);
            const structuredOutputName = getStructuredOutputName(options);

            return createObjectStream(
                transformStructuredOutputStream<TSchema>(
                    stream,
                    normalizeStructuredOutputSchema(options),
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
