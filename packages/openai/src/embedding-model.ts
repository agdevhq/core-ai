import type OpenAI from 'openai';
import type {
    EmbedOptions,
    EmbedResult,
    EmbeddingModel,
} from '@core-ai/core-ai';
import { wrapOpenAIError } from './openai-error.js';
import {
    parseOpenAIEmbedProviderOptions,
    type OpenAIEmbedProviderOptions,
} from './provider-options.js';

type OpenAIEmbeddingClient = {
    embeddings: OpenAI['embeddings'];
};

export function createOpenAIEmbeddingModel(
    client: OpenAIEmbeddingClient,
    modelId: string
): EmbeddingModel {
    return {
        provider: 'openai',
        modelId,
        async embed(options: EmbedOptions): Promise<EmbedResult> {
            try {
                const openaiOptions = parseOpenAIEmbedProviderOptions(
                    options.providerOptions
                );
                const response = await client.embeddings.create({
                    model: modelId,
                    input: options.input,
                    ...(options.dimensions !== undefined
                        ? { dimensions: options.dimensions }
                        : {}),
                    ...mapOpenAIEmbedProviderOptionsToRequestFields(
                        openaiOptions
                    ),
                });

                return {
                    embeddings: response.data
                        .slice()
                        .sort((a, b) => a.index - b.index)
                        .map((item) => item.embedding),
                    usage: {
                        inputTokens: response.usage.prompt_tokens,
                    },
                };
            } catch (error) {
                throw wrapOpenAIError(error);
            }
        },
    };
}

function mapOpenAIEmbedProviderOptionsToRequestFields(
    options: OpenAIEmbedProviderOptions | undefined
) {
    return {
        ...(options?.encodingFormat !== undefined
            ? { encoding_format: options.encodingFormat }
            : {}),
        ...(options?.user !== undefined ? { user: options.user } : {}),
    };
}
