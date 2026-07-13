import { createVertexAnthropic } from '../../../../packages/vertex-anthropic/src/index.ts';
import { getEnvOrDefault, getEnvValue, hasApiKey } from '../env.ts';
import type { ProviderE2EAdapter } from './provider-adapter.ts';

const GOOGLE_VERTEX_PROJECT_ENV = 'GOOGLE_VERTEX_PROJECT';
const GOOGLE_VERTEX_REGION_ENV = 'GOOGLE_VERTEX_REGION';
const GOOGLE_APPLICATION_CREDENTIALS_BASE64_ENV =
    'GOOGLE_APPLICATION_CREDENTIALS_BASE64';
const VERTEX_ANTHROPIC_CHAT_MODEL_ENV = 'VERTEX_ANTHROPIC_E2E_CHAT_MODEL';
const VERTEX_ANTHROPIC_REASONING_MODEL_ENV =
    'VERTEX_ANTHROPIC_E2E_REASONING_MODEL';

export function createVertexAnthropicAdapter(): ProviderE2EAdapter {
    const chatModelId = getEnvOrDefault(
        VERTEX_ANTHROPIC_CHAT_MODEL_ENV,
        'claude-haiku-4-5'
    );
    const reasoningModelId = getEnvOrDefault(
        VERTEX_ANTHROPIC_REASONING_MODEL_ENV,
        'claude-sonnet-4-6'
    );

    return {
        id: 'vertex-anthropic',
        displayName: 'Vertex AI Anthropic',
        apiKeyEnvVar: GOOGLE_VERTEX_PROJECT_ENV,
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
        isConfigured: () => hasApiKey(GOOGLE_VERTEX_PROJECT_ENV),
        createChatModel: () =>
            createVertexAnthropicProvider().chatModel(chatModelId),
        createReasoningChatModel: () =>
            createVertexAnthropicProvider().chatModel(reasoningModelId),
    };
}

function createVertexAnthropicProvider() {
    const projectId = getEnvValue(GOOGLE_VERTEX_PROJECT_ENV);
    const region = getEnvOrDefault(GOOGLE_VERTEX_REGION_ENV, 'europe-west1');
    const credentialsBase64 = getEnvValue(
        GOOGLE_APPLICATION_CREDENTIALS_BASE64_ENV
    );

    return createVertexAnthropic({
        projectId,
        region,
        ...(credentialsBase64
            ? {
                  credentials: JSON.parse(
                      Buffer.from(credentialsBase64, 'base64').toString(
                          'utf-8'
                      )
                  ),
              }
            : {}),
    });
}
