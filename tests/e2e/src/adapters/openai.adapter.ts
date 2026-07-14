import { createOpenAI } from '../../../../packages/openai/src/index.ts';
import { getEnvOrDefault, getEnvValue, hasApiKey } from '../env.ts';
import type { ProviderE2EAdapter } from './provider-adapter.ts';

const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';
const OPENAI_CHAT_MODEL_ENV = 'OPENAI_E2E_CHAT_MODEL';
const OPENAI_REASONING_MODEL_ENV = 'OPENAI_E2E_REASONING_MODEL';
const OPENAI_EMBED_MODEL_ENV = 'OPENAI_E2E_EMBED_MODEL';
const OPENAI_IMAGE_MODEL_ENV = 'OPENAI_E2E_IMAGE_MODEL';

export function createOpenAIAdapter(): ProviderE2EAdapter {
    const chatModelId = getEnvOrDefault(OPENAI_CHAT_MODEL_ENV, 'gpt-5.6-luna');
    const reasoningModelId = getEnvOrDefault(
        OPENAI_REASONING_MODEL_ENV,
        'gpt-5.6-luna'
    );
    const embeddingModelId = getEnvOrDefault(
        OPENAI_EMBED_MODEL_ENV,
        'text-embedding-3-small'
    );
    const imageModelId = getEnvOrDefault(
        OPENAI_IMAGE_MODEL_ENV,
        'gpt-image-1-mini'
    );

    return {
        id: 'openai',
        displayName: 'OpenAI (Responses)',
        apiKeyEnvVar: OPENAI_API_KEY_ENV,
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
        isConfigured: () => hasApiKey(OPENAI_API_KEY_ENV),
        createChatModel: () => createOpenAIProvider().chatModel(chatModelId),
        createReasoningChatModel: () =>
            createOpenAIProvider().chatModel(reasoningModelId),
        createEmbeddingModel: () =>
            createOpenAIProvider().embeddingModel(embeddingModelId),
        createImageModel: () => createOpenAIProvider().imageModel(imageModelId),
    };
}

export function createOpenAIChatAdapter(): ProviderE2EAdapter {
    const chatModelId = getEnvOrDefault(OPENAI_CHAT_MODEL_ENV, 'gpt-5.6-luna');
    const reasoningModelId = getEnvOrDefault(
        OPENAI_REASONING_MODEL_ENV,
        'gpt-5.6-luna'
    );

    return {
        id: 'openai-chat',
        displayName: 'OpenAI (Chat Completions)',
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
            createOpenAIProvider().chat.chatModel(chatModelId),
        createReasoningChatModel: () =>
            createOpenAIProvider().chat.chatModel(reasoningModelId),
    };
}

function createOpenAIProvider() {
    return createOpenAI({
        apiKey: getEnvValue(OPENAI_API_KEY_ENV),
    });
}
