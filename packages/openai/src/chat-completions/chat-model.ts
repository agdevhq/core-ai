import type OpenAI from 'openai';
import type { z } from 'zod';
import type { ChatCompletionChunk } from 'openai/resources/chat/completions/completions';
import type {
    ChatModel,
    GenerateObjectOptions,
    GenerateObjectResult,
    GenerateOptions,
    GenerateResult,
    StreamObjectOptions,
    ObjectStream,
    ChatStream,
} from '@core-ai/core-ai';
import { createObjectStream, createChatStream } from '@core-ai/core-ai';
import {
    createStructuredOutputOptions,
    createGenerateRequest,
    createStreamRequest,
    getStructuredOutputToolName,
    mapGenerateResponse,
    type OpenAIChatCompletionsAdapterOptions,
    transformStream,
} from './chat-adapter.js';
import { wrapOpenAIError } from '../openai-error.js';
import { getOpenAIModelCapabilities } from '../model-capabilities.js';
import {
    extractStructuredObject,
    transformStructuredOutputStream,
} from '../shared/structured-output.js';

export type OpenAIChatClient = {
    chat: OpenAI['chat'];
};

export type OpenAIChatCompletionsModelOptions =
    OpenAIChatCompletionsAdapterOptions & {
        providerId?: string;
    };

export function createOpenAIChatCompletionsModel(
    client: OpenAIChatClient,
    modelId: string,
    modelOptions: OpenAIChatCompletionsModelOptions = {}
): ChatModel {
    const provider = modelOptions.providerId ?? 'openai';

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
        options: GenerateOptions
    ): Promise<GenerateResult> {
        const request = createGenerateRequest(modelId, options);
        const response = await callOpenAIChatCompletionsApi<
            Parameters<typeof mapGenerateResponse>[0]
        >(request, options.signal);
        return mapGenerateResponse(response, {
            compatibility: modelOptions.compatibility,
        });
    }

    async function streamChat(options: GenerateOptions): Promise<ChatStream> {
        const request = createStreamRequest(modelId, options);
        return createChatStream(
            async () =>
                transformStream(
                    await callOpenAIChatCompletionsApi<
                        AsyncIterable<ChatCompletionChunk>
                    >(request, options.signal),
                    {
                        compatibility: modelOptions.compatibility,
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
            const structuredOptions = createStructuredOutputOptions(options);
            const result = await generateChat(structuredOptions);
            const toolName = getStructuredOutputToolName(options);
            const object = extractStructuredObject(
                result,
                options.schema,
                provider,
                toolName
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
            const toolName = getStructuredOutputToolName(options);

            return createObjectStream(
                transformStructuredOutputStream(
                    stream,
                    options.schema,
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
