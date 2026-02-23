import { APIError } from 'openai';
import type OpenAI from 'openai';
import { ProviderError } from '@core-ai/ai';
import type { EmbedOptions, EmbedResult, EmbeddingModel } from '@core-ai/ai';

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
                throw wrapError(error);
            }
        },
    };
}

function wrapError(error: unknown): ProviderError {
    if (error instanceof APIError) {
        return new ProviderError(error.message, 'openai', error.status, error);
    }

    return new ProviderError(
        error instanceof Error ? error.message : String(error),
        'openai',
        undefined,
        error
    );
}
