import { createXAI } from '../../../../packages/xai/src/index.ts';
import { getEnvOrDefault, getEnvValue, hasApiKey } from '../env.ts';
import type { ProviderE2EAdapter } from './provider-adapter.ts';

const XAI_API_KEY_ENV = 'XAI_API_KEY';
const XAI_BASE_URL_ENV = 'XAI_BASE_URL';
const XAI_CHAT_MODEL_ENV = 'XAI_E2E_CHAT_MODEL';
const XAI_REASONING_MODEL_ENV = 'XAI_E2E_REASONING_MODEL';

export function createXAIAdapter(): ProviderE2EAdapter {
    const chatModelId = getEnvOrDefault(XAI_CHAT_MODEL_ENV, 'grok-4.3');
    const reasoningModelId = getEnvOrDefault(
        XAI_REASONING_MODEL_ENV,
        'grok-4.3'
    );

    const baseURL = process.env[XAI_BASE_URL_ENV];

    return {
        id: 'xai',
        displayName: 'xAI',
        apiKeyEnvVar: XAI_API_KEY_ENV,
        models: {
            chat: chatModelId,
            reasoning: reasoningModelId,
        },
        capabilities: {
            chat: true,
            stream: true,
            object: true,
            reasoning: true,
            embedding: false,
            image: false,
        },
        isConfigured: () => hasApiKey(XAI_API_KEY_ENV),
        createChatModel: () =>
            createXAI({
                apiKey: getEnvValue(XAI_API_KEY_ENV),
                baseURL,
            }).chatModel(chatModelId),
        createReasoningChatModel: () =>
            createXAI({
                apiKey: getEnvValue(XAI_API_KEY_ENV),
                baseURL,
            }).chatModel(reasoningModelId),
    };
}
