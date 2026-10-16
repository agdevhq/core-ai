import type { Mistral } from '@mistralai/mistralai';
import type { CompletionEvent } from '@mistralai/mistralai/models/components';
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
    createStreamRequest,
    getStructuredOutputToolName,
    mapGenerateResponse,
    transformStream,
} from './chat-adapter.ts';
import { wrapMistralError } from './mistral-error.ts';
import { getMistralModelCapabilities } from './model-capabilities.ts';

type MistralChatClient = {
    chat: Mistral['chat'];
};

export function createMistralChatModel(
    client: MistralChatClient,
    modelId: string
): ChatModel {
    const provider = 'mistral';
    const capabilities = getMistralModelCapabilities(modelId);
    const adapterOptions = { capabilities, providerId: provider };

    async function callMistralChatApi<TResponse>(
        call: () => Promise<TResponse>
    ): Promise<TResponse> {
        try {
            return await call();
        } catch (error) {
            throw wrapMistralError(error);
        }
    }

    async function generateChat(
        options: GenerateOptions
    ): Promise<GenerateResult> {
        const request = createGenerateRequest(modelId, options, adapterOptions);
        const response = await callMistralChatApi(() =>
            client.chat.complete(request, { signal: options.signal })
        );
        return finalizeGenerateResult(mapGenerateResponse(response), options);
    }

    async function streamChat(options: GenerateOptions): Promise<ChatStream> {
        const request = createStreamRequest(modelId, options, adapterOptions);
        return createChatStream(
            async () =>
                transformStream(
                    (await callMistralChatApi(() =>
                        client.chat.stream(request, {
                            signal: options.signal,
                        })
                    )) as unknown as AsyncIterable<CompletionEvent>
                ),
            {
                signal: options.signal,
                mapError: wrapMistralError,
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
