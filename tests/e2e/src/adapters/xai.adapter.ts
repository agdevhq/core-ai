import { createXAI } from '../../../../packages/xai/src/index.ts';
import { getEnvOrDefault, getEnvValue, hasApiKey } from '../env.ts';
import type { ProviderE2EAdapter } from './provider-adapter.ts';

const XAI_API_KEY_ENV = 'XAI_API_KEY';
const XAI_BASE_URL_ENV = 'XAI_BASE_URL';
const XAI_CHAT_MODEL_ENV = 'XAI_E2E_CHAT_MODEL';
const XAI_REASONING_MODEL_ENV = 'XAI_E2E_REASONING_MODEL';
const DEFAULT_MODEL_ID = 'grok-4.7';

const CHAT_ONLY_CAPABILITIES = {
    chat: true,
    stream: true,
    object: true,
    reasoning: true,
    embedding: false,
    image: false,
} as const;

export function createXAIAdapter(): ProviderE2EAdapter {
    const models = getModelIds();

    return {
        id: 'xai',
        displayName: 'xAI (Responses)',
        apiKeyEnvVar: XAI_API_KEY_ENV,
        models,
        capabilities: CHAT_ONLY_CAPABILITIES,
        isConfigured: () => hasApiKey(XAI_API_KEY_ENV),
        createChatModel: () => createXAIProvider().chatModel(models.chat),
        createReasoningChatModel: () =>
            createXAIProvider().chatModel(models.reasoning),
    };
}

export function createXAIChatAdapter(): ProviderE2EAdapter {
    const models = getModelIds();

    return {
        id: 'xai-chat',
        displayName: 'xAI (Chat Completions)',
        apiKeyEnvVar: XAI_API_KEY_ENV,
        models,
        capabilities: CHAT_ONLY_CAPABILITIES,
        isConfigured: () => hasApiKey(XAI_API_KEY_ENV),
        createChatModel: () => createXAIProvider().chat.chatModel(models.chat),
        createReasoningChatModel: () =>
            createXAIProvider().chat.chatModel(models.reasoning),
    };
}

function getModelIds() {
    return {
        chat: getEnvOrDefault(XAI_CHAT_MODEL_ENV, DEFAULT_MODEL_ID),
        reasoning: getEnvOrDefault(XAI_REASONING_MODEL_ENV, DEFAULT_MODEL_ID),
    };
}

function createXAIProvider() {
    return createXAI({
        apiKey: getEnvValue(XAI_API_KEY_ENV),
        baseURL: getEnvValue(XAI_BASE_URL_ENV),
    });
}
