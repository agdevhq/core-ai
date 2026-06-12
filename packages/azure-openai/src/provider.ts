import OpenAI, { AzureOpenAI } from 'openai';
import type { ChatModel } from '@core-ai/core-ai';
import {
    createOpenAICompatChatProvider,
    type OpenAIChatClient,
} from '@core-ai/openai/compat';

const PROVIDER_ID = 'azure-openai';

type AzureOpenAIV1Options = {
    api?: 'v1';
    apiKey?: string;
    endpoint?: string;
    client?: OpenAIChatClient;
};

type AzureOpenAIClassicOptions = {
    api: 'classic';
    apiKey?: string;
    endpoint?: string;
    apiVersion: string;
    deployment?: string;
    azureADTokenProvider?: () => Promise<string>;
    client?: OpenAIChatClient;
};

export type AzureOpenAIProviderOptions =
    | AzureOpenAIV1Options
    | AzureOpenAIClassicOptions;

export type AzureOpenAIProvider = {
    chatModel(modelId: string): ChatModel;
};

export function createAzureOpenAI(
    options: AzureOpenAIProviderOptions = {}
): AzureOpenAIProvider {
    const client = options.client ?? createAzureOpenAIClient(options);

    return createOpenAICompatChatProvider({ client }, PROVIDER_ID);
}

function createAzureOpenAIClient(
    options: AzureOpenAIProviderOptions
): OpenAIChatClient {
    if (options.api === 'classic') {
        return new AzureOpenAI({
            apiKey: options.apiKey,
            endpoint: options.endpoint,
            apiVersion: options.apiVersion,
            deployment: options.deployment,
            azureADTokenProvider: options.azureADTokenProvider,
        });
    }

    return new OpenAI({
        apiKey: options.apiKey,
        baseURL: getAzureOpenAIV1BaseURL(options.endpoint),
    });
}

function getAzureOpenAIV1BaseURL(
    endpoint: string | undefined
): string | undefined {
    if (!endpoint) {
        return undefined;
    }

    const baseURL = endpoint.replace(/\/+$/, '');
    if (baseURL.endsWith('/openai/v1')) {
        return baseURL;
    }

    return `${baseURL}/openai/v1`;
}
