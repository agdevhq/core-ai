import type OpenAI from 'openai';
import type { z } from 'zod';
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
    StreamObjectOptions,
    ObjectStream,
    ChatStream,
} from '@core-ai/core-ai';
import {
    createObjectStream,
    createChatStream,
} from '@core-ai/core-ai';
import {
    createGenerateRequest,
    createStreamRequest,
    mapGenerateResponse,
    type OpenAIChatCompletionsAdapterOptions,
    transformStream,
} from './chat-adapter.js';
import { wrapOpenAIError } from '../openai-error.js';
import type { OpenAIResolvedCompatibilityOptions } from '../shared/compatibility-options.js';
import {
    createStructuredOutputRequestOptions,
    extractStructuredObject,
    getStructuredOutputName,
    transformStructuredOutputStream,
    type OpenAIRequestOptions,
} from '../shared/structured-output.js';

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
        return mapGenerateResponse(response, adapterOptions);
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
            }
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
            const structuredOptions = createStructuredOutputRequestOptions(
                options,
                structuredOutputMode
            );
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
            const structuredOptions = createStructuredOutputRequestOptions(
                options,
                structuredOutputMode
            );
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
