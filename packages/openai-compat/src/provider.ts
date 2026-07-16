import type { ChatModel } from '@core-ai/core-ai';
import {
    createOpenAIProvider,
    type OpenAICompatibilityOptions,
    type OpenAIProviderBaseOptions,
    type OpenAIStructuredOutputMode,
} from '@core-ai/openai';

export type OpenAICompatProviderOptions = OpenAIProviderBaseOptions & {
    /** Whether to extract nonstandard reasoning response fields. Defaults to `true`. */
    reasoning?: boolean;
    /**
     * Structured output transport. Defaults to `tool` for broad compatibility.
     * Use `json-schema` when the endpoint supports strict JSON Schema response formats.
     * Use `json-object` when it only supports JSON Mode.
     */
    structuredOutputMode?: OpenAIStructuredOutputMode;
    /**
     * Request parameter used for `maxTokens`. When unset, known OpenAI models
     * use their registered capability and unknown models use `max_tokens`.
     */
    maxTokensParameter?: OpenAICompatibilityOptions['maxTokensParameter'];
};

export type OpenAICompatProvider = {
    chatModel(modelId: string): ChatModel;
};

export function createOpenAICompat(
    options: OpenAICompatProviderOptions = {}
): OpenAICompatProvider {
    const provider = createOpenAIProvider(options, {
        providerId: 'openai-compat',
        providerOptionsKey: 'openai',
        defaultApi: 'chat-completions',
        compatibility: {
            reasoning: options.reasoning,
            structuredOutputMode: options.structuredOutputMode,
            maxTokensParameter: options.maxTokensParameter,
        },
    });

    return {
        chatModel: provider.chatModel,
    };
}
