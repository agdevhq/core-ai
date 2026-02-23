import { GoogleGenAI } from '@google/genai';
import type { ChatModel, EmbeddingModel, ImageModel } from '@core-ai/core-ai';
import { createGoogleGenAIChatModel } from './chat-model.js';
import { createGoogleGenAIEmbeddingModel } from './embedding-model.js';
import { createGoogleGenAIImageModel } from './image-model.js';

export type GoogleGenAIProviderOptions = {
    apiKey?: string;
    apiVersion?: string;
    baseUrl?: string;
    client?: GoogleGenAI;
};

export type GoogleGenAIProvider = {
    chatModel(modelId: string): ChatModel;
    embeddingModel(modelId: string): EmbeddingModel;
    imageModel(modelId: string): ImageModel;
};

export function createGoogleGenAI(
    options: GoogleGenAIProviderOptions = {}
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

    return {
        chatModel: (modelId) => createGoogleGenAIChatModel(client, modelId),
        embeddingModel: (modelId) =>
            createGoogleGenAIEmbeddingModel(client, modelId),
        imageModel: (modelId) => createGoogleGenAIImageModel(client, modelId),
    };
}
