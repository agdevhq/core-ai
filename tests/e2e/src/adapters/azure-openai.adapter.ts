import { createAzureOpenAI } from '../../../../packages/azure-openai/src/index.ts';
import { getEnvOrDefault, getEnvValue, hasApiKey } from '../env.ts';
import type { ProviderE2EAdapter } from './provider-adapter.ts';

const AZURE_OPENAI_API_KEY_ENV = 'AZURE_OPENAI_API_KEY';
const AZURE_OPENAI_ENDPOINT_ENV = 'AZURE_OPENAI_ENDPOINT';
const AZURE_OPENAI_API_VERSION_ENV = 'AZURE_OPENAI_API_VERSION';
const AZURE_OPENAI_CHAT_DEPLOYMENT_ENV = 'AZURE_OPENAI_E2E_CHAT_DEPLOYMENT';
const AZURE_OPENAI_REASONING_DEPLOYMENT_ENV =
    'AZURE_OPENAI_E2E_REASONING_DEPLOYMENT';

export function createAzureOpenAIAdapter(): ProviderE2EAdapter {
    const chatModelId = getEnvOrDefault(
        AZURE_OPENAI_CHAT_DEPLOYMENT_ENV,
        'gpt-5.6-luna'
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
            hasApiKey(AZURE_OPENAI_API_KEY_ENV) &&
            getEnvValue(AZURE_OPENAI_ENDPOINT_ENV) !== undefined,
        createChatModel: () =>
            createAzureOpenAIV1Provider().chatModel(chatModelId),
        createReasoningChatModel: () =>
            createAzureOpenAIV1Provider().chatModel(reasoningModelId),
    };
}

export function createAzureOpenAIChatAdapter(): ProviderE2EAdapter {
    const chatModelId = getEnvOrDefault(
        AZURE_OPENAI_CHAT_DEPLOYMENT_ENV,
        'gpt-5.6-luna'
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
            createAzureOpenAIV1Provider().chat.chatModel(chatModelId),
        createReasoningChatModel: () =>
            createAzureOpenAIV1Provider().chat.chatModel(reasoningModelId),
    };
}

export function createAzureOpenAIClassicAdapter(): ProviderE2EAdapter {
    const chatModelId = getEnvOrDefault(
        AZURE_OPENAI_CHAT_DEPLOYMENT_ENV,
        'gpt-5.6-luna'
    );
    const reasoningModelId = getEnvOrDefault(
        AZURE_OPENAI_REASONING_DEPLOYMENT_ENV,
        chatModelId
    );

    return {
        id: 'azure-openai-classic',
        displayName: 'Azure OpenAI (Classic)',
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
            createAzureOpenAIClassicProvider().chatModel(chatModelId),
        createReasoningChatModel: () =>
            createAzureOpenAIClassicProvider().chatModel(reasoningModelId),
    };
}

function createAzureOpenAIV1Provider() {
    return createAzureOpenAI({
        apiKey: getEnvValue(AZURE_OPENAI_API_KEY_ENV),
        endpoint: getEnvValue(AZURE_OPENAI_ENDPOINT_ENV),
    });
}

function createAzureOpenAIClassicProvider() {
    return createAzureOpenAI({
        api: 'classic',
        apiKey: getEnvValue(AZURE_OPENAI_API_KEY_ENV),
        endpoint: getEnvValue(AZURE_OPENAI_ENDPOINT_ENV),
        apiVersion: getEnvOrDefault(
            AZURE_OPENAI_API_VERSION_ENV,
            '2025-04-01-preview'
        ),
    });
}
