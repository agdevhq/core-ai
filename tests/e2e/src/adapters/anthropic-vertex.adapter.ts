import { createAnthropicVertex } from '../../../../packages/anthropic-vertex/src/index.ts';
import { parseGoogleApplicationCredentialsJson } from '../google-credentials.ts';
import {
    getEnvOrDefault,
    getEnvValue,
    hasApiKey,
    isEnvFlagEnabled,
} from '../env.ts';
import type { ProviderE2EAdapter } from './provider-adapter.ts';

const GOOGLE_VERTEX_PROJECT_ENV = 'GOOGLE_VERTEX_PROJECT';
const GOOGLE_VERTEX_REGION_ENV = 'GOOGLE_VERTEX_REGION';
const GOOGLE_APPLICATION_CREDENTIALS_JSON_ENV =
    'GOOGLE_APPLICATION_CREDENTIALS_JSON';
const ANTHROPIC_VERTEX_CHAT_MODEL_ENV = 'ANTHROPIC_VERTEX_E2E_CHAT_MODEL';
const ANTHROPIC_VERTEX_REASONING_MODEL_ENV =
    'ANTHROPIC_VERTEX_E2E_REASONING_MODEL';
const ANTHROPIC_VERTEX_STRICT_TOOL_SCHEMAS_ENV =
    'ANTHROPIC_VERTEX_E2E_STRICT_TOOL_SCHEMAS_ENABLED';

export function createAnthropicVertexAdapter(): ProviderE2EAdapter {
    const chatModelId = getEnvOrDefault(
        ANTHROPIC_VERTEX_CHAT_MODEL_ENV,
        'claude-haiku-4-5'
    );
    const reasoningModelId = getEnvOrDefault(
        ANTHROPIC_VERTEX_REASONING_MODEL_ENV,
        'claude-sonnet-4-6'
    );

    return {
        id: 'anthropic-vertex',
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
        // Strict tool schemas on Vertex require the GCP org policy
        // `constraints/vertexai.allowedPartnerModelFeatures` to allow
        // `structured_outputs` for the project.
        isStrictToolsConfigured: () =>
            isEnvFlagEnabled(ANTHROPIC_VERTEX_STRICT_TOOL_SCHEMAS_ENV),
        createChatModel: () =>
            createAnthropicVertexProvider().chatModel(chatModelId),
        createReasoningChatModel: () =>
            createAnthropicVertexProvider().chatModel(reasoningModelId),
    };
}

function createAnthropicVertexProvider() {
    const projectId = getEnvValue(GOOGLE_VERTEX_PROJECT_ENV);
    const region = getEnvOrDefault(GOOGLE_VERTEX_REGION_ENV, 'europe-west1');
    const credentialsJson = getEnvValue(
        GOOGLE_APPLICATION_CREDENTIALS_JSON_ENV
    );

    return createAnthropicVertex({
        projectId,
        region,
        ...(credentialsJson
            ? {
                  credentials: parseGoogleApplicationCredentialsJson(
                      credentialsJson,
                      GOOGLE_APPLICATION_CREDENTIALS_JSON_ENV
                  ),
              }
            : {}),
    });
}
