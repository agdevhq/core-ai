import type { EmbedContentParameters, GoogleGenAI } from '@google/genai';
import type {
    EmbedOptions,
    EmbedResult,
    EmbeddingModel,
} from '@core-ai/core-ai';
import { wrapGoogleError } from './google-error.js';
import { asObject } from './object-utils.js';

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
                const providerOptions = options.providerOptions;
                const request: EmbedContentParameters = providerOptions
                    ? {
                          ...baseRequest,
                          ...(providerOptions as Partial<EmbedContentParameters>),
                          config: {
                              ...baseRequest.config,
                              ...(asObject(providerOptions['config']) as Record<
                                  string,
                                  unknown
                              >),
                          },
                      }
                    : baseRequest;
                const response = await client.models.embedContent(request);

                return {
                    embeddings: (response.embeddings ?? []).map(
                        (item) => item.values ?? []
                    ),
                    usage: {
                        inputTokens: (response.embeddings ?? []).reduce(
                            (total, item) =>
                                total + (item.statistics?.tokenCount ?? 0),
                            0
                        ),
                    },
                };
            } catch (error) {
                throw wrapGoogleError(error);
            }
        },
    };
}

