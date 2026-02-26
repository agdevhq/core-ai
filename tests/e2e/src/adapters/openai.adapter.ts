import { createOpenAI } from '../../../../packages/openai/src/index.ts';
import { getEnvOrDefault, getEnvValue, hasApiKey } from '../env.ts';
import type { ProviderE2EAdapter } from './provider-adapter.ts';

const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';
const OPENAI_CHAT_MODEL_ENV = 'OPENAI_E2E_CHAT_MODEL';
const OPENAI_EMBED_MODEL_ENV = 'OPENAI_E2E_EMBED_MODEL';
const OPENAI_IMAGE_MODEL_ENV = 'OPENAI_E2E_IMAGE_MODEL';

export function createOpenAIAdapter(): ProviderE2EAdapter {
    const chatModelId = getEnvOrDefault(OPENAI_CHAT_MODEL_ENV, 'gpt-5-mini');
    const embeddingModelId = getEnvOrDefault(
        OPENAI_EMBED_MODEL_ENV,
        'text-embedding-3-small'
    );
    const imageModelId = getEnvOrDefault(OPENAI_IMAGE_MODEL_ENV, 'gpt-image-1');

    return {
        id: 'openai',
        displayName: 'OpenAI',
        apiKeyEnvVar: OPENAI_API_KEY_ENV,
        models: {
            chat: chatModelId,
            embedding: embeddingModelId,
            image: imageModelId,
        },
        capabilities: {
            chat: true,
            stream: true,
            object: true,
            embedding: true,
            image: true,
        },
        isConfigured: () => hasApiKey(OPENAI_API_KEY_ENV),
        createChatModel: () =>
            createOpenAI({
                apiKey: getEnvValue(OPENAI_API_KEY_ENV),
            }).chatModel(chatModelId),
        createEmbeddingModel: () =>
            createOpenAI({
                apiKey: getEnvValue(OPENAI_API_KEY_ENV),
            }).embeddingModel(embeddingModelId),
        createImageModel: () =>
            createOpenAI({
                apiKey: getEnvValue(OPENAI_API_KEY_ENV),
            }).imageModel(imageModelId),
    };
}
