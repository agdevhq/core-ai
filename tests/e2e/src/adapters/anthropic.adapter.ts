import { createAnthropic } from '../../../../packages/anthropic/src/index.ts';
import { getEnvOrDefault, getEnvValue, hasApiKey } from '../env.ts';
import type { ProviderE2EAdapter } from './provider-adapter.ts';

const ANTHROPIC_API_KEY_ENV = 'ANTHROPIC_API_KEY';
const ANTHROPIC_CHAT_MODEL_ENV = 'ANTHROPIC_E2E_CHAT_MODEL';

export function createAnthropicAdapter(): ProviderE2EAdapter {
    const chatModelId = getEnvOrDefault(
        ANTHROPIC_CHAT_MODEL_ENV,
        'claude-haiku-4-5'
    );

    return {
        id: 'anthropic',
        displayName: 'Anthropic',
        apiKeyEnvVar: ANTHROPIC_API_KEY_ENV,
        models: {
            chat: chatModelId,
        },
        capabilities: {
            chat: true,
            stream: true,
            object: true,
            embedding: false,
            image: false,
        },
        isConfigured: () => hasApiKey(ANTHROPIC_API_KEY_ENV),
        createChatModel: () =>
            createAnthropic({
                apiKey: getEnvValue(ANTHROPIC_API_KEY_ENV),
            }).chatModel(chatModelId),
    };
}
