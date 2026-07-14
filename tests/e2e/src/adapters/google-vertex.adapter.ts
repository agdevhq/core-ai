import { createGoogleVertex } from '../../../../packages/google-vertex/src/index.ts';
import { getEnvOrDefault, getEnvValue, hasApiKey } from '../env.ts';
import type { ProviderE2EAdapter } from './provider-adapter.ts';

const GOOGLE_VERTEX_PROJECT_ENV = 'GOOGLE_VERTEX_PROJECT';
const GOOGLE_VERTEX_REGION_ENV = 'GOOGLE_VERTEX_REGION';
const GOOGLE_APPLICATION_CREDENTIALS_JSON_ENV =
    'GOOGLE_APPLICATION_CREDENTIALS_JSON';
const GOOGLE_VERTEX_CHAT_MODEL_ENV = 'GOOGLE_VERTEX_E2E_CHAT_MODEL';
const GOOGLE_VERTEX_REASONING_MODEL_ENV = 'GOOGLE_VERTEX_E2E_REASONING_MODEL';
const GOOGLE_VERTEX_EMBED_MODEL_ENV = 'GOOGLE_VERTEX_E2E_EMBED_MODEL';
const GOOGLE_VERTEX_IMAGE_MODEL_ENV = 'GOOGLE_VERTEX_E2E_IMAGE_MODEL';

export function createGoogleVertexAdapter(): ProviderE2EAdapter {
    const chatModelId = getEnvOrDefault(
        GOOGLE_VERTEX_CHAT_MODEL_ENV,
        'gemini-2.5-flash'
    );
    const reasoningModelId = getEnvOrDefault(
        GOOGLE_VERTEX_REASONING_MODEL_ENV,
        'gemini-2.5-pro'
    );
    const embeddingModelId = getEnvOrDefault(
        GOOGLE_VERTEX_EMBED_MODEL_ENV,
        'gemini-embedding-001'
    );
    const imageModelId = getEnvOrDefault(
        GOOGLE_VERTEX_IMAGE_MODEL_ENV,
        'imagen-4.0-generate-001'
    );

    return {
        id: 'google-vertex',
        displayName: 'Vertex AI Google',
        apiKeyEnvVar: GOOGLE_VERTEX_PROJECT_ENV,
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
        isConfigured: () => hasApiKey(GOOGLE_VERTEX_PROJECT_ENV),
        createChatModel: () =>
            createGoogleVertexProvider().chatModel(chatModelId),
        createReasoningChatModel: () =>
            createGoogleVertexProvider().chatModel(reasoningModelId),
        createEmbeddingModel: () =>
            createGoogleVertexProvider().embeddingModel(embeddingModelId),
        createImageModel: () =>
            createGoogleVertexProvider().imageModel(imageModelId),
    };
}

function createGoogleVertexProvider() {
    const projectId = getEnvValue(GOOGLE_VERTEX_PROJECT_ENV);
    const region = getEnvOrDefault(GOOGLE_VERTEX_REGION_ENV, 'europe-west1');
    const credentialsJson = getEnvValue(
        GOOGLE_APPLICATION_CREDENTIALS_JSON_ENV
    );

    return createGoogleVertex({
        projectId,
        region,
        ...(credentialsJson
            ? { credentials: parseCredentialsJson(credentialsJson) }
            : {}),
    });
}

function parseCredentialsJson(
    credentialsJson: string
): Record<string, unknown> {
    const credentials: unknown = JSON.parse(credentialsJson);
    if (
        typeof credentials !== 'object' ||
        credentials === null ||
        Array.isArray(credentials)
    ) {
        throw new Error(
            `${GOOGLE_APPLICATION_CREDENTIALS_JSON_ENV} must contain a JSON object`
        );
    }

    return credentials as Record<string, unknown>;
}
