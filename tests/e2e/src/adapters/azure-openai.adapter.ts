import { createAzureOpenAI } from '../../../../packages/azure-openai/src/index.ts';
import { getEnvOrDefault, getEnvValue, hasApiKey } from '../env.ts';
import type { ProviderE2EAdapter } from './provider-adapter.ts';

const AZURE_OPENAI_API_ENV = 'AZURE_OPENAI_API';
const AZURE_OPENAI_API_KEY_ENV = 'AZURE_OPENAI_API_KEY';
const AZURE_OPENAI_ENDPOINT_ENV = 'AZURE_OPENAI_ENDPOINT';
const AZURE_OPENAI_API_VERSION_ENV = 'AZURE_OPENAI_API_VERSION';
const AZURE_OPENAI_CHAT_DEPLOYMENT_ENV = 'AZURE_OPENAI_E2E_CHAT_DEPLOYMENT';
const AZURE_OPENAI_REASONING_DEPLOYMENT_ENV =
    'AZURE_OPENAI_E2E_REASONING_DEPLOYMENT';

export function createAzureOpenAIAdapter(): ProviderE2EAdapter {
    const chatModelId = getEnvOrDefault(
        AZURE_OPENAI_CHAT_DEPLOYMENT_ENV,
        'gpt-5-mini'
    );
    const reasoningModelId = getEnvOrDefault(
        AZURE_OPENAI_REASONING_DEPLOYMENT_ENV,
        chatModelId
    );
    return {
        id: 'azure-openai',
        displayName: 'Azure OpenAI (Responses)',
        apiKeyEnvVar: AZURE_OPENAI_API_KEY_ENV,
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
        isConfigured: () =>
            getEnvValue(AZURE_OPENAI_API_ENV) !== 'classic' &&
            hasApiKey(AZURE_OPENAI_API_KEY_ENV) &&
            getEnvValue(AZURE_OPENAI_ENDPOINT_ENV) !== undefined,
        createChatModel: () =>
            createAzureOpenAIProvider().chatModel(chatModelId),
        createReasoningChatModel: () =>
            createAzureOpenAIProvider().chatModel(reasoningModelId),
    };
}

export function createAzureOpenAIChatAdapter(): ProviderE2EAdapter {
    const chatModelId = getEnvOrDefault(
        AZURE_OPENAI_CHAT_DEPLOYMENT_ENV,
        'gpt-5-mini'
    );
    const reasoningModelId = getEnvOrDefault(
        AZURE_OPENAI_REASONING_DEPLOYMENT_ENV,
        chatModelId
    );

    return {
        id: 'azure-openai-chat',
        displayName: 'Azure OpenAI (Chat Completions)',
        apiKeyEnvVar: AZURE_OPENAI_API_KEY_ENV,
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
        isConfigured: () =>
            hasApiKey(AZURE_OPENAI_API_KEY_ENV) &&
            getEnvValue(AZURE_OPENAI_ENDPOINT_ENV) !== undefined,
        createChatModel: () =>
            createAzureOpenAIProvider().chat.chatModel(chatModelId),
        createReasoningChatModel: () =>
            createAzureOpenAIProvider().chat.chatModel(reasoningModelId),
    };
}

function createAzureOpenAIProvider() {
    const apiKey = getEnvValue(AZURE_OPENAI_API_KEY_ENV);
    const endpoint = getEnvValue(AZURE_OPENAI_ENDPOINT_ENV);

    if (getEnvValue(AZURE_OPENAI_API_ENV) === 'classic') {
        return createAzureOpenAI({
            api: 'classic',
            apiKey,
            endpoint,
            apiVersion: getEnvOrDefault(
                AZURE_OPENAI_API_VERSION_ENV,
                '2025-04-01-preview'
            ),
        });
    }

    return createAzureOpenAI({
        apiKey,
        endpoint,
    });
}
