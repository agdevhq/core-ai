import type { ChatModel } from '@core-ai/core-ai';
import {
    createOpenAIProvider,
    type OpenAIProviderBaseOptions,
} from '@core-ai/openai';

export type OpenAICompatProviderOptions = OpenAIProviderBaseOptions;

export type OpenAICompatProvider = {
    chatModel(modelId: string): ChatModel;
};

export function createOpenAICompat(
    options: OpenAICompatProviderOptions = {}
): OpenAICompatProvider {
    const provider = createOpenAIProvider(options, {
        providerId: 'openai-compat',
        defaultApi: 'chat-completions',
        chat: { compatibility: true },
    });

    return {
        chatModel: provider.chatModel,
    };
}
