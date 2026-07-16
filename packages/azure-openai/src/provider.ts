import OpenAI, { AzureOpenAI } from 'openai';
import type { ChatModel } from '@core-ai/core-ai';
import {
    createOpenAIChatCompletionsModel,
    createOpenAIProvider,
    getOpenAIModelCapabilities,
    type OpenAIChatClient,
} from '@core-ai/openai';

const PROVIDER_ID = 'azure-openai';

type AzureOpenAIV1Options = {
    api?: 'v1';
    apiKey?: string;
    endpoint?: string;
    client?: OpenAI;
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
    chat: {
        chatModel(modelId: string): ChatModel;
    };
};

export function createAzureOpenAI(
    options: AzureOpenAIProviderOptions = {}
): AzureOpenAIProvider {
    if (options.api === 'classic') {
        const client =
            options.client ??
            new AzureOpenAI({
                apiKey: options.apiKey,
                endpoint: options.endpoint,
                apiVersion: options.apiVersion,
                deployment: options.deployment,
                azureADTokenProvider: options.azureADTokenProvider,
            });
        const chat = {
            chatModel: (modelId: string) =>
                createOpenAIChatCompletionsModel(client, modelId, {
                    capabilities: getOpenAIModelCapabilities(modelId),
                    providerId: PROVIDER_ID,
                }),
        };

        return {
            chatModel: chat.chatModel,
            chat,
        };
    }

    const client =
        options.client ??
        new OpenAI({
            apiKey: options.apiKey,
            baseURL: getAzureOpenAIV1BaseURL(options.endpoint),
        });
    const provider = createOpenAIProvider(
        { client },
        {
            providerId: PROVIDER_ID,
        }
    );

    return {
        chatModel: provider.chatModel,
        chat: provider.chat,
    };
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
