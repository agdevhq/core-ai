import { createGoogleGenAI } from '../../../../packages/google-genai/src/index.ts';
import { getEnvOrDefault, getEnvValue, hasApiKey } from '../env.ts';
import type { ProviderE2EAdapter } from './provider-adapter.ts';

const GOOGLE_API_KEY_ENV = 'GOOGLE_API_KEY';
const GOOGLE_CHAT_MODEL_ENV = 'GOOGLE_E2E_CHAT_MODEL';
const GOOGLE_REASONING_MODEL_ENV = 'GOOGLE_E2E_REASONING_MODEL';
const GOOGLE_EMBED_MODEL_ENV = 'GOOGLE_E2E_EMBED_MODEL';
const GOOGLE_IMAGE_MODEL_ENV = 'GOOGLE_E2E_IMAGE_MODEL';

export function createGoogleGenAIAdapter(): ProviderE2EAdapter {
    const chatModelId = getEnvOrDefault(
        GOOGLE_CHAT_MODEL_ENV,
        'gemini-2.5-flash'
    );
    const reasoningModelId = getEnvOrDefault(
        GOOGLE_REASONING_MODEL_ENV,
        'gemini-2.5-pro'
    );
    const embeddingModelId = getEnvOrDefault(
        GOOGLE_EMBED_MODEL_ENV,
        'gemini-embedding-001'
    );
    const imageModelId = getEnvOrDefault(
        GOOGLE_IMAGE_MODEL_ENV,
        'imagen-4.0-generate-001'
    );

    return {
        id: 'google',
        displayName: 'Google GenAI',
        apiKeyEnvVar: GOOGLE_API_KEY_ENV,
        models: {
            chat: chatModelId,
            reasoning: reasoningModelId,
            embedding: embeddingModelId,
            image: imageModelId,
        },
        capabilities: {
            chat: true,
            stream: true,
            object: true,
            reasoning: true,
            embedding: true,
            image: true,
        },
        isConfigured: () => hasApiKey(GOOGLE_API_KEY_ENV),
        createChatModel: () =>
            createGoogleGenAI({
                apiKey: getEnvValue(GOOGLE_API_KEY_ENV),
            }).chatModel(chatModelId),
        createReasoningChatModel: () =>
            createGoogleGenAI({
                apiKey: getEnvValue(GOOGLE_API_KEY_ENV),
            }).chatModel(reasoningModelId),
        createEmbeddingModel: () =>
            createGoogleGenAI({
                apiKey: getEnvValue(GOOGLE_API_KEY_ENV),
            }).embeddingModel(embeddingModelId),
        createImageModel: () =>
            createGoogleGenAI({
                apiKey: getEnvValue(GOOGLE_API_KEY_ENV),
            }).imageModel(imageModelId),
    };
}
