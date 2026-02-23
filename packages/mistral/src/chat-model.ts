import type { Mistral } from '@mistralai/mistralai';
import type { CompletionEvent } from '@mistralai/mistralai/models/components';
import type {
    ChatModel,
    GenerateOptions,
    GenerateResult,
    StreamResult,
} from '@core-ai/core-ai';
import { createStreamResult } from '@core-ai/core-ai';
import {
    createGenerateRequest,
    createStreamRequest,
    mapGenerateResponse,
    transformStream,
    wrapError,
} from './chat-adapter.js';

type MistralChatClient = {
    chat: Mistral['chat'];
};

export function createMistralChatModel(
    client: MistralChatClient,
    modelId: string
): ChatModel {
    return {
        provider: 'mistral',
        modelId,
        async generate(options: GenerateOptions): Promise<GenerateResult> {
            try {
                const request = createGenerateRequest(modelId, options);
                const response = await client.chat.complete(request);
                return mapGenerateResponse(response);
            } catch (error) {
                throw wrapError(error);
            }
        },
        async stream(options: GenerateOptions): Promise<StreamResult> {
            try {
                const request = createStreamRequest(modelId, options);
                const stream = (await client.chat.stream(
                    request
                )) as unknown as AsyncIterable<CompletionEvent>;
                return createStreamResult(transformStream(stream));
            } catch (error) {
                throw wrapError(error);
            }
        },
    };
}
