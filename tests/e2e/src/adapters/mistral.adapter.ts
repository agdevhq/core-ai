import { createMistral } from '../../../../packages/mistral/src/index.ts';
import { getEnvOrDefault, getEnvValue, hasApiKey } from '../env.ts';
import type { ProviderE2EAdapter } from './provider-adapter.ts';

const MISTRAL_API_KEY_ENV = 'MISTRAL_API_KEY';
const MISTRAL_CHAT_MODEL_ENV = 'MISTRAL_E2E_CHAT_MODEL';
const MISTRAL_EMBED_MODEL_ENV = 'MISTRAL_E2E_EMBED_MODEL';

export function createMistralAdapter(): ProviderE2EAdapter {
    const chatModelId = getEnvOrDefault(
        MISTRAL_CHAT_MODEL_ENV,
        'mistral-large-latest'
    );
    const embeddingModelId = getEnvOrDefault(
        MISTRAL_EMBED_MODEL_ENV,
        'mistral-embed'
    );

    return {
        id: 'mistral',
        displayName: 'Mistral',
        apiKeyEnvVar: MISTRAL_API_KEY_ENV,
        models: {
            chat: chatModelId,
            embedding: embeddingModelId,
        },
        capabilities: {
            chat: true,
            stream: true,
            object: true,
            embedding: true,
            image: false,
        },
        isConfigured: () => hasApiKey(MISTRAL_API_KEY_ENV),
        createChatModel: () =>
            createMistral({
                apiKey: getEnvValue(MISTRAL_API_KEY_ENV),
            }).chatModel(chatModelId),
        createEmbeddingModel: () =>
            createMistral({
                apiKey: getEnvValue(MISTRAL_API_KEY_ENV),
            }).embeddingModel(embeddingModelId),
    };
}
