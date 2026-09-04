import { createKimi } from '../../../../packages/kimi/src/index.ts';
import { getEnvOrDefault, getEnvValue, hasApiKey } from '../env.ts';
import type { ProviderE2EAdapter } from './provider-adapter.ts';

const KIMI_API_KEY_ENV = 'KIMI_API_KEY';
const KIMI_BASE_URL_ENV = 'KIMI_BASE_URL';
const KIMI_CHAT_MODEL_ENV = 'KIMI_E2E_CHAT_MODEL';
const KIMI_REASONING_MODEL_ENV = 'KIMI_E2E_REASONING_MODEL';

export function createKimiAdapter(): ProviderE2EAdapter {
    const chatModelId = getEnvOrDefault(KIMI_CHAT_MODEL_ENV, 'kimi-k2.7-code');
    const reasoningModelId = getEnvOrDefault(
        KIMI_REASONING_MODEL_ENV,
        'kimi-k2.7-code'
    );

    const baseURL = process.env[KIMI_BASE_URL_ENV];

    return {
        id: 'kimi',
        displayName: 'Kimi',
        apiKeyEnvVar: KIMI_API_KEY_ENV,
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
        isConfigured: () => hasApiKey(KIMI_API_KEY_ENV),
        createChatModel: () =>
            createKimi({
                apiKey: getEnvValue(KIMI_API_KEY_ENV),
                baseURL,
            }).chatModel(chatModelId),
        createReasoningChatModel: () =>
            createKimi({
                apiKey: getEnvValue(KIMI_API_KEY_ENV),
                baseURL,
            }).chatModel(reasoningModelId),
    };
}
