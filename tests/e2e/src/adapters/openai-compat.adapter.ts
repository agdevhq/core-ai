import { createOpenAICompat } from '../../../../packages/openai-compat/src/index.ts';
import { getEnvOrDefault, getEnvValue, hasApiKey } from '../env.ts';
import type { ProviderE2EAdapter } from './provider-adapter.ts';

const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';
const OPENAI_COMPAT_CHAT_MODEL_ENV = 'OPENAI_COMPAT_E2E_CHAT_MODEL';
const OPENAI_COMPAT_REASONING_MODEL_ENV = 'OPENAI_COMPAT_E2E_REASONING_MODEL';

export function createOpenAICompatAdapter(): ProviderE2EAdapter {
    const chatModelId = getEnvOrDefault(
        OPENAI_COMPAT_CHAT_MODEL_ENV,
        'gpt-5-mini'
    );
    const reasoningModelId = getEnvOrDefault(
        OPENAI_COMPAT_REASONING_MODEL_ENV,
        'gpt-5-mini'
    );
    return {
        id: 'openai-compat',
        displayName: 'OpenAI Compat',
        apiKeyEnvVar: OPENAI_API_KEY_ENV,
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
        isConfigured: () => hasApiKey(OPENAI_API_KEY_ENV),
        createChatModel: () =>
            createOpenAICompat({
                apiKey: getEnvValue(OPENAI_API_KEY_ENV),
            }).chatModel(chatModelId),
        createReasoningChatModel: () =>
            createOpenAICompat({
                apiKey: getEnvValue(OPENAI_API_KEY_ENV),
            }).chatModel(reasoningModelId),
    };
}
