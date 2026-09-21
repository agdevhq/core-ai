import type { ChatModel } from '@core-ai/core-ai';
import {
    createOpenAIProvider,
    type OpenAIProviderBaseOptions,
} from '@core-ai/openai';

import { DEFAULT_BASE_URL } from './constants.ts';
import { XAI_MODEL_CAPABILITIES } from './model-capabilities.ts';
import {
    xaiChatGenerateProviderOptionsSchema,
    xaiResponsesGenerateProviderOptionsSchema,
} from './provider-options.ts';

export type XAIProviderOptions = OpenAIProviderBaseOptions;

export type XAIProvider = {
    /** Responses API — xAI's recommended surface. */
    chatModel(modelId: string): ChatModel;
    /** Legacy Chat Completions API. */
    chat: {
        chatModel(modelId: string): ChatModel;
    };
};

export function createXAI(options: XAIProviderOptions = {}): XAIProvider {
    if (!options.apiKey && !options.client) {
        throw new Error('createXAI: apiKey is required.');
    }

    const provider = createOpenAIProvider(
        {
            ...options,
            baseURL: options.baseURL ?? DEFAULT_BASE_URL,
        },
        {
            modelCapabilities: XAI_MODEL_CAPABILITIES,
            providerId: 'xai',
            providerOptionsSchema: xaiChatGenerateProviderOptionsSchema,
            responsesProviderOptionsSchema:
                xaiResponsesGenerateProviderOptionsSchema,
            compatibility: {
                reasoning: {
                    requestField: 'reasoning_content',
                },
                structuredOutputMode: 'json-schema',
                maxTokensParameter: 'max_completion_tokens',
                // Chat Completions reports reasoning tokens outside
                // `completion_tokens`; the Responses API includes them.
                reasoningTokenAccounting: 'separate',
            },
        }
    );

    return {
        chatModel: provider.chatModel,
        chat: provider.chat,
    };
}
