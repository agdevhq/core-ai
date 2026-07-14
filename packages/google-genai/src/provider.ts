import { GoogleGenAI } from '@google/genai';
import type { ChatModel, EmbeddingModel, ImageModel } from '@core-ai/core-ai';
import { createGoogleGenAIChatModel } from './chat-model.js';
import { createGoogleGenAIEmbeddingModel } from './embedding-model.js';
import { createGoogleGenAIImageModel } from './image-model.js';

export const DEFAULT_PROVIDER_ID = 'google';

export type GoogleGenAIClient = {
    models: GoogleGenAI['models'];
};

export type GoogleGenAIProviderBaseOptions = {
    apiKey?: string;
    apiVersion?: string;
    baseUrl?: string;
    client?: GoogleGenAIClient;
};

export type GoogleGenAIProviderFactoryOptions = {
    providerId?: string;
};

export type GoogleGenAIProviderOptions = GoogleGenAIProviderBaseOptions;

export type GoogleGenAIProvider = {
    chatModel(modelId: string): ChatModel;
    embeddingModel(modelId: string): EmbeddingModel;
    imageModel(modelId: string): ImageModel;
};

export function createGoogleGenAIProvider(
    options: GoogleGenAIProviderBaseOptions = {},
    factoryOptions: GoogleGenAIProviderFactoryOptions = {}
): GoogleGenAIProvider {
    const client =
        options.client ??
        new GoogleGenAI({
            apiKey: options.apiKey,
            ...(options.apiVersion ? { apiVersion: options.apiVersion } : {}),
            ...(options.baseUrl
                ? {
                      httpOptions: {
                          baseUrl: options.baseUrl,
                      },
                  }
                : {}),
        });
    const providerId = factoryOptions.providerId ?? DEFAULT_PROVIDER_ID;

    return {
        chatModel: (modelId) =>
            createGoogleGenAIChatModel(client, modelId, providerId),
        embeddingModel: (modelId) =>
            createGoogleGenAIEmbeddingModel(client, modelId, providerId),
        imageModel: (modelId) =>
            createGoogleGenAIImageModel(client, modelId, providerId),
    };
}

export function createGoogleGenAI(
    options: GoogleGenAIProviderOptions = {}
): GoogleGenAIProvider {
    return createGoogleGenAIProvider(options);
}
