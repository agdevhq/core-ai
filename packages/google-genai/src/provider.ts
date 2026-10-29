import { GoogleGenAI } from '@google/genai';
import type { ChatModel, EmbeddingModel, ImageModel } from '@core-ai/core-ai';
import { DEFAULT_PROVIDER_ID } from './chat-adapter.ts';
import { createGoogleGenAIChatModel } from './chat-model.ts';
import { createGoogleGenAIEmbeddingModel } from './embedding-model.ts';
import { createGoogleGenAIImageModel } from './image-model.ts';
import type { GooglePlatform } from './model-capabilities.ts';

export { DEFAULT_PROVIDER_ID };

export type GoogleGenAIClient = {
    models: GoogleGenAI['models'];
    /** Set by `GoogleGenAI` when the client targets Vertex AI. */
    vertexai?: GoogleGenAI['vertexai'];
};

export type GoogleGenAIProviderBaseOptions = {
    apiKey?: string;
    apiVersion?: string;
    baseUrl?: string;
    client?: GoogleGenAIClient;
};

export type GoogleGenAIProviderFactoryOptions = {
    providerId?: string;
    /**
     * Selects the host-specific limits in model capabilities. Defaults to the
     * client's own target: `'vertex'` when it was built with `vertexai: true`.
     */
    platform?: GooglePlatform;
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
    const platform =
        factoryOptions.platform ?? (client.vertexai ? 'vertex' : 'gemini-api');

    return {
        chatModel: (modelId) =>
            createGoogleGenAIChatModel(client, modelId, providerId, platform),
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
