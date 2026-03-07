import type { EmbedContentParameters, GoogleGenAI } from '@google/genai';
import type {
    EmbedOptions,
    EmbedResult,
    EmbeddingModel,
} from '@core-ai/core-ai';
import { wrapGoogleError } from './google-error.js';
import {
    parseGoogleEmbedProviderOptions,
    type GoogleEmbedProviderOptions,
} from './provider-options.js';

type GoogleGenAIEmbeddingClient = {
    models: GoogleGenAI['models'];
};

export function createGoogleGenAIEmbeddingModel(
    client: GoogleGenAIEmbeddingClient,
    modelId: string
): EmbeddingModel {
    return {
        provider: 'google',
        modelId,
        async embed(options: EmbedOptions): Promise<EmbedResult> {
            try {
                const baseRequest: EmbedContentParameters = {
                    model: modelId,
                    contents: Array.isArray(options.input)
                        ? options.input
                        : [options.input],
                    ...(options.dimensions !== undefined
                        ? {
                              config: {
                                  outputDimensionality: options.dimensions,
                              },
                          }
                        : {}),
                };
                const googleOptions = parseGoogleEmbedProviderOptions(
                    options.providerOptions
                );
                const providerConfig =
                    mapGoogleEmbedProviderOptionsToConfig(googleOptions);
                const request: EmbedContentParameters =
                    Object.keys(providerConfig).length > 0
                        ? {
                              ...baseRequest,
                              config: {
                                  ...baseRequest.config,
                                  ...providerConfig,
                              },
                          }
                        : baseRequest;
                const response = await client.models.embedContent(request);
                const tokenCounts = (response.embeddings ?? [])
                    .map((item) => item.statistics?.tokenCount)
                    .filter(
                        (tokenCount): tokenCount is number =>
                            typeof tokenCount === 'number'
                    );
                const usage =
                    tokenCounts.length > 0
                        ? {
                              inputTokens: tokenCounts.reduce(
                                  (total, tokenCount) => total + tokenCount,
                                  0
                              ),
                          }
                        : undefined;

                return {
                    embeddings: (response.embeddings ?? []).map(
                        (item) => item.values ?? []
                    ),
                    usage,
                };
            } catch (error) {
                throw wrapGoogleError(error);
            }
        },
    };
}

function mapGoogleEmbedProviderOptionsToConfig(
    options: GoogleEmbedProviderOptions | undefined
): Record<string, unknown> {
    return {
        ...(options?.taskType !== undefined
            ? { taskType: options.taskType }
            : {}),
        ...(options?.title !== undefined ? { title: options.title } : {}),
        ...(options?.mimeType !== undefined
            ? { mimeType: options.mimeType }
            : {}),
        ...(options?.autoTruncate !== undefined
            ? { autoTruncate: options.autoTruncate }
            : {}),
    };
}
