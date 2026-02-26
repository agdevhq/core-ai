import { APIError } from 'openai';
import { ProviderError } from '@core-ai/core-ai';

export function wrapOpenAIError(error: unknown): ProviderError {
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
