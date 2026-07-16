import type { ChatModel } from '@core-ai/core-ai';
import {
    createOpenAIProvider,
    type OpenAIProviderBaseOptions,
} from '@core-ai/openai';

import { DEFAULT_BASE_URL } from './constants.ts';
import { KIMI_MODEL_CAPABILITIES } from './model-capabilities.ts';
import { kimiGenerateProviderOptionsSchema } from './provider-options.ts';

export type KimiProviderOptions = OpenAIProviderBaseOptions;

export type KimiProvider = {
    chatModel(modelId: string): ChatModel;
};

export function createKimi(options: KimiProviderOptions = {}): KimiProvider {
    if (!options.apiKey && !options.client) {
        throw new Error('createKimi: apiKey is required.');
    }

    const provider = createOpenAIProvider(
        {
            ...options,
            baseURL: options.baseURL ?? DEFAULT_BASE_URL,
        },
        {
            modelCapabilities: KIMI_MODEL_CAPABILITIES,
            providerId: 'kimi',
            providerOptionsSchema: kimiGenerateProviderOptionsSchema,
            defaultApi: 'chat-completions',
            compatibility: {
                reasoning: {
                    requestField: 'reasoning_content',
                },
                structuredOutputMode: 'json-object',
                maxTokensParameter: 'max_tokens',
            },
        }
    );

    return {
        chatModel: provider.chatModel,
    };
}
