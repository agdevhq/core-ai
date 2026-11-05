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
    DEFAULT_MAX_RETRIES,
    createObjectStream,
    createChatStream,
    extractStructuredObject,
    finalizeGenerateResult,
    normalizeStructuredOutputSchema,
    transformStructuredOutputStream,
    withRequestRetry,
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

export type MistralChatModelOptions = {
    /** Retries of transient request failures; `0` disables them. */
    maxRetries?: number;
};

export function createMistralChatModel(
    client: MistralChatClient,
    modelId: string,
    modelOptions: MistralChatModelOptions = {}
): ChatModel {
    const provider = 'mistral';
    const capabilities = getMistralModelCapabilities(modelId);
    const adapterOptions = { capabilities, providerId: provider };
    const maxRetries = modelOptions.maxRetries ?? DEFAULT_MAX_RETRIES;

    function callMistralChatApi<TResponse>(
        call: () => Promise<TResponse>,
        signal: AbortSignal | undefined
    ): Promise<TResponse> {
        return withRequestRetry(call, {
            maxRetries,
            provider,
            signal,
            wrapError: wrapMistralError,
        });
    }

    async function generateChat(
        options: GenerateOptions
    ): Promise<GenerateResult> {
        const request = createGenerateRequest(modelId, options, adapterOptions);
        const response = await callMistralChatApi(
            () => client.chat.complete(request, { signal: options.signal }),
            options.signal
        );
        return finalizeGenerateResult(mapGenerateResponse(response), options);
    }

    async function streamChat(options: GenerateOptions): Promise<ChatStream> {
        const request = createStreamRequest(modelId, options, adapterOptions);
        return createChatStream(
            async () =>
                transformStream(
                    // The SDK resolves this once the response headers arrive,
                    // so a retry only ever repeats a request that produced no
                    // stream events.
                    (await callMistralChatApi(
                        () =>
                            client.chat.stream(request, {
                                signal: options.signal,
                            }),
                        options.signal
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
