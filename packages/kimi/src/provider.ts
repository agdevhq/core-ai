import type { ChatModel } from '@core-ai/core-ai';
import {
    createOpenAIProvider,
    type OpenAIProviderBaseOptions,
} from '@core-ai/openai';

import { prepareKimiGenerateOptions } from './compatibility.ts';
import { DEFAULT_BASE_URL } from './constants.ts';
import {
    KIMI_MODEL_CAPABILITIES,
    type KimiModelCapabilities,
} from './model-capabilities.ts';

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
            defaultApi: 'chat-completions',
            compatibility: {
                reasoning: {
                    requestField: 'reasoning_content',
                },
                structuredOutputMode: 'json-object',
                maxTokensParameter: 'max_tokens',
                prepareGenerateOptions: (
                    modelId,
                    generateOptions,
                    capabilities
                ) =>
                    prepareKimiGenerateOptions(
                        modelId,
                        generateOptions,
                        capabilities as KimiModelCapabilities
                    ),
            },
        }
    );

    return {
        chatModel: provider.chatModel,
    };
}
