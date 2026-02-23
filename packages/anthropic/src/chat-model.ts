import type Anthropic from '@anthropic-ai/sdk';
import type { RawMessageStreamEvent } from '@anthropic-ai/sdk/resources/messages/messages';
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

type AnthropicMessagesClient = {
    messages: Anthropic['messages'];
};

export function createAnthropicChatModel(
    client: AnthropicMessagesClient,
    modelId: string,
    defaultMaxTokens: number
): ChatModel {
    return {
        provider: 'anthropic',
        modelId,
        async generate(options: GenerateOptions): Promise<GenerateResult> {
            try {
                const request = createGenerateRequest(
                    modelId,
                    defaultMaxTokens,
                    options
                );
                const response = await client.messages.create(request as never);

                return mapGenerateResponse(response);
            } catch (error) {
                throw wrapError(error);
            }
        },
        async stream(options: GenerateOptions): Promise<StreamResult> {
            try {
                const request = createStreamRequest(
                    modelId,
                    defaultMaxTokens,
                    options
                );
                const stream = (await client.messages.create(
                    request as never
                )) as unknown as AsyncIterable<RawMessageStreamEvent>;
                return createStreamResult(transformStream(stream));
            } catch (error) {
                throw wrapError(error);
            }
        },
    };
}
