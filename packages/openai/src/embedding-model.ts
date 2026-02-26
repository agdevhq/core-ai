import type OpenAI from 'openai';
import type {
    EmbedOptions,
    EmbedResult,
    EmbeddingModel,
} from '@core-ai/core-ai';
import { wrapOpenAIError } from './openai-error.js';

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
                const response = await client.embeddings.create({
                    model: modelId,
                    input: options.input,
                    ...(options.dimensions !== undefined
                        ? { dimensions: options.dimensions }
                        : {}),
                    ...options.providerOptions,
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
