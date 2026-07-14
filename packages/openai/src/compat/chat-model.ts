import {
    createOpenAIChatCompletionsModel,
    type OpenAIChatClient,
} from '../chat-completions/chat-model.js';

export type { OpenAIChatClient };

/** @deprecated Use `createOpenAI().chat.chatModel()` instead. */
export function createOpenAICompatChatModel(
    client: OpenAIChatClient,
    modelId: string,
    providerId = 'openai'
) {
    return createOpenAIChatCompletionsModel(client, modelId, {
        providerId,
        compatibility: true,
    });
}
