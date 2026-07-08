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
    transformStream,
} from './chat-adapter.js';
import { getOpenAIModelCapabilities } from './model-capabilities.js';
import { wrapOpenAIError } from './openai-error.js';
import {
    extractStructuredObject,
    transformStructuredOutputStream,
} from './shared/structured-output.js';

type OpenAIChatClient = {
    responses: OpenAI['responses'];
};

export function createOpenAIChatModel(
    client: OpenAIChatClient,
    modelId: string
): ChatModel {
    const provider = 'openai';

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
            throw wrapOpenAIError(error);
        }
    }

    async function generateChat(
        options: GenerateOptions
    ): Promise<GenerateResult> {
        const request = createGenerateRequest(modelId, options);
        const response = await callOpenAIResponsesApi<Response>(
            request,
            options.signal
        );
        return mapGenerateResponse(response);
    }

    async function streamChat(options: GenerateOptions): Promise<ChatStream> {
        const request = createStreamRequest(modelId, options);
        return createChatStream(
            async () =>
                transformStream(
                    await callOpenAIResponsesApi<
                        AsyncIterable<ResponseStreamEvent>
                    >(request, options.signal)
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
