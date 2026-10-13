import type OpenAI from 'openai';
import type {
    ChatCompletion,
    ChatCompletionChunk,
} from 'openai/resources/chat/completions/completions';
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
    finalizeGenerateResult,
    normalizeStructuredOutputSchema,
} from '@core-ai/core-ai';
import {
    createGenerateRequest,
    createStreamRequest,
    mapGenerateResponse,
    type OpenAIChatCompletionsAdapterOptions,
    transformStream,
} from './chat-adapter.ts';
import { wrapOpenAIError } from '../openai-error.ts';
import type { OpenAIResolvedCompatibilityOptions } from '../shared/compatibility-options.ts';
import {
    createStructuredOutputRequestOptions,
    extractStructuredObject,
    getStructuredOutputName,
    transformStructuredOutputStream,
    type OpenAIRequestOptions,
} from '../shared/structured-output.ts';

export type OpenAIChatClient = {
    chat: OpenAI['chat'];
};

export type OpenAIChatCompletionsModelOptions = {
    capabilities: ModelCapabilities;
    providerId?: string;
    compatibility?: OpenAIResolvedCompatibilityOptions;
    providerOptions?: OpenAIChatCompletionsAdapterOptions['providerOptions'];
};

export function createOpenAIChatCompletionsModel(
    client: OpenAIChatClient,
    modelId: string,
    modelOptions: OpenAIChatCompletionsModelOptions
): ChatModel {
    const provider = modelOptions.providerId ?? 'openai';
    const capabilities = modelOptions.capabilities;
    const compatibilityOptions = modelOptions.compatibility;
    const structuredOutputMode =
        compatibilityOptions?.structuredOutputMode ??
        (compatibilityOptions ? 'tool' : 'json-schema');
    const adapterOptions = {
        capabilities,
        compatibility:
            compatibilityOptions !== undefined &&
            compatibilityOptions.reasoning !== false,
        maxTokensParameter: compatibilityOptions?.maxTokensParameter,
        reasoningTokenAccounting:
            compatibilityOptions?.reasoningTokenAccounting,
        providerId: provider,
        providerOptions: modelOptions.providerOptions,
        reasoning:
            typeof compatibilityOptions?.reasoning === 'object'
                ? compatibilityOptions.reasoning
                : undefined,
    } satisfies OpenAIChatCompletionsAdapterOptions;

    async function callOpenAIChatCompletionsApi<TResponse>(
        request: unknown,
        signal?: AbortSignal
    ): Promise<TResponse> {
        try {
            return (await client.chat.completions.create(request as never, {
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
        const response = await callOpenAIChatCompletionsApi<ChatCompletion>(
            request,
            options.signal
        );
        return finalizeGenerateResult(
            mapGenerateResponse(response, adapterOptions),
            options
        );
    }

    async function streamChat(
        options: OpenAIRequestOptions
    ): Promise<ChatStream> {
        const request = createStreamRequest(modelId, options, adapterOptions);
        return createChatStream(
            async () =>
                transformStream(
                    await callOpenAIChatCompletionsApi<
                        AsyncIterable<ChatCompletionChunk>
                    >(request, options.signal),
                    adapterOptions
                ),
            {
                signal: options.signal,
                mapError: (error) => wrapOpenAIError(error, provider),
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
            const structuredOptions = createStructuredOutputRequestOptions(
                options,
                structuredOutputMode,
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
                structuredOutputMode,
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
