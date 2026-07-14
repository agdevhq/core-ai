import type { ChatModel } from '@core-ai/core-ai';
import {
    createOpenAIProvider,
    type OpenAIProviderBaseOptions,
    type OpenAIStructuredOutputMode,
} from '@core-ai/openai';

export type OpenAICompatProviderOptions = OpenAIProviderBaseOptions & {
    /** Whether to extract nonstandard reasoning response fields. Defaults to `true`. */
    reasoning?: boolean;
    /**
     * Structured output transport. Defaults to `tool` for broad compatibility.
     * Use `native` when the endpoint supports strict JSON Schema response formats.
     */
    structuredOutputMode?: OpenAIStructuredOutputMode;
};

export type OpenAICompatProvider = {
    chatModel(modelId: string): ChatModel;
};

export function createOpenAICompat(
    options: OpenAICompatProviderOptions = {}
): OpenAICompatProvider {
    const provider = createOpenAIProvider(options, {
        providerId: 'openai-compat',
        defaultApi: 'chat-completions',
        compatibility: {
            reasoning: options.reasoning,
            structuredOutputMode: options.structuredOutputMode,
        },
    });

    return {
        chatModel: provider.chatModel,
    };
}
