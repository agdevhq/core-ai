import type OpenAI from 'openai';
import type { z } from 'zod';
import type { ChatCompletionChunk } from 'openai/resources/chat/completions/completions';
import type {
    ChatModel,
    GenerateObjectOptions,
    GenerateObjectResult,
    GenerateResult,
    StreamObjectOptions,
    ObjectStream,
    ChatStream,
} from '@core-ai/core-ai';
import { createObjectStream, createChatStream } from '@core-ai/core-ai';
import {
    createGenerateRequest,
    createStreamRequest,
    mapGenerateResponse,
    type OpenAIChatCompletionsAdapterOptions,
    transformStream,
} from './chat-adapter.js';
import { wrapOpenAIError } from '../openai-error.js';
import { getOpenAIModelCapabilities } from '../model-capabilities.js';
import {
    createStructuredOutputRequestOptions,
    extractStructuredObject,
    getStructuredOutputName,
    transformStructuredOutputStream,
    type OpenAIRequestOptions,
    type OpenAIStructuredOutputMode,
} from '../shared/structured-output.js';

export type OpenAIChatClient = {
    chat: OpenAI['chat'];
};

export type OpenAIChatCompletionsModelOptions =
    OpenAIChatCompletionsAdapterOptions & {
        providerId?: string;
        nonStandardReasoning?: boolean;
        structuredOutputMode?: OpenAIStructuredOutputMode;
    };

export function createOpenAIChatCompletionsModel(
    client: OpenAIChatClient,
    modelId: string,
    modelOptions: OpenAIChatCompletionsModelOptions = {}
): ChatModel {
    const provider = modelOptions.providerId ?? 'openai';
    const structuredOutputMode =
        modelOptions.structuredOutputMode ??
        (modelOptions.compatibility ? 'tool' : 'native');
    const nonStandardReasoning =
        modelOptions.nonStandardReasoning ?? modelOptions.compatibility;

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
        const request = createGenerateRequest(modelId, options, modelOptions);
        const response = await callOpenAIChatCompletionsApi<
            Parameters<typeof mapGenerateResponse>[0]
        >(request, options.signal);
        return mapGenerateResponse(response, {
            compatibility: nonStandardReasoning,
        });
    }

    async function streamChat(
        options: OpenAIRequestOptions
    ): Promise<ChatStream> {
        const request = createStreamRequest(modelId, options, modelOptions);
        return createChatStream(
            async () =>
                transformStream(
                    await callOpenAIChatCompletionsApi<
                        AsyncIterable<ChatCompletionChunk>
                    >(request, options.signal),
                    {
                        compatibility: nonStandardReasoning,
                    }
                ),
            { signal: options.signal }
        );
    }

    return {
        provider,
        modelId,
        capabilities: getOpenAIModelCapabilities(modelId),
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
