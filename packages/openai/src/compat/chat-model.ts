import {
    createOpenAIChatCompletionsModel,
    type OpenAIChatClient,
} from '../chat-completions/chat-model.ts';
import { getOpenAIModelCapabilities } from '../model-capabilities.ts';

export type { OpenAIChatClient };

/** @deprecated Use `createOpenAI().chat.chatModel()` instead. */
export function createOpenAICompatChatModel(
    client: OpenAIChatClient,
    modelId: string,
    providerId = 'openai'
) {
    return createOpenAIChatCompletionsModel(client, modelId, {
        capabilities: getOpenAIModelCapabilities(modelId),
        providerId,
        compatibility: { reasoning: true },
    });
}
