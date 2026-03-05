import type { Mistral } from '@mistralai/mistralai';
import type { EmbeddingRequest } from '@mistralai/mistralai/models/components';
import type {
    EmbedOptions,
    EmbedResult,
    EmbeddingModel,
} from '@core-ai/core-ai';
import { wrapMistralError } from './mistral-error.js';
import { parseMistralEmbedProviderOptions } from './provider-options.js';

type MistralEmbeddingClient = {
    embeddings: Mistral['embeddings'];
};

export function createMistralEmbeddingModel(
    client: MistralEmbeddingClient,
    modelId: string
): EmbeddingModel {
    return {
        provider: 'mistral',
        modelId,
        async embed(options: EmbedOptions): Promise<EmbedResult> {
            try {
                const baseRequest: EmbeddingRequest = {
                    model: modelId,
                    inputs: options.input,
                    ...(options.dimensions !== undefined
                        ? { outputDimension: options.dimensions }
                        : {}),
                };
                const mistralOptions = parseMistralEmbedProviderOptions(
                    options.providerOptions
                );

                const request = mistralOptions
                    ? {
                          ...baseRequest,
                          ...mistralOptions,
                      }
                    : baseRequest;

                const response = await client.embeddings.create(request);
                return {
                    embeddings: response.data
                        .slice()
                        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
                        .map((item) => item.embedding ?? []),
                    usage: {
                        inputTokens: response.usage.promptTokens ?? 0,
                    },
                };
            } catch (error) {
                throw wrapMistralError(error);
            }
        },
    };
}
