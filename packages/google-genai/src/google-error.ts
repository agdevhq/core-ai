import { ApiError } from '@google/genai';
import { ProviderError } from '@core-ai/core-ai';

export function wrapGoogleError(
    error: unknown,
    provider = 'google'
): ProviderError {
    if (error instanceof ApiError) {
        return new ProviderError(error.message, provider, error.status, error);
    }

    return new ProviderError(
        error instanceof Error ? error.message : String(error),
        provider,
        undefined,
        error
    );
}
