import { GoogleGenAI } from '@google/genai';
import type { ChatModel, EmbeddingModel, ImageModel } from '@core-ai/core-ai';
import { createGoogleChatModel } from './chat-model.js';
import { createGoogleEmbeddingModel } from './embedding-model.js';
import { createGoogleImageModel } from './image-model.js';

export const DEFAULT_PROVIDER_ID = 'google';

export type GoogleClient = {
    models: GoogleGenAI['models'];
};

export type GoogleProviderOptions = {
    apiKey?: string;
    apiVersion?: string;
    baseUrl?: string;
    client?: GoogleClient;
};

export type GoogleProvider = {
    chatModel(modelId: string): ChatModel;
    embeddingModel(modelId: string): EmbeddingModel;
    imageModel(modelId: string): ImageModel;
};

export function createGoogleProvider(
    options: GoogleProviderOptions = {},
    providerId = DEFAULT_PROVIDER_ID
): GoogleProvider {
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

    return {
        chatModel: (modelId) =>
            createGoogleChatModel(client, modelId, providerId),
        embeddingModel: (modelId) =>
            createGoogleEmbeddingModel(client, modelId, providerId),
        imageModel: (modelId) =>
            createGoogleImageModel(client, modelId, providerId),
    };
}

export function createGoogle(
    options: GoogleProviderOptions = {}
): GoogleProvider {
    return createGoogleProvider(options, DEFAULT_PROVIDER_ID);
}
