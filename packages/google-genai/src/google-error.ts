import { ApiError } from '@google/genai';
import { ProviderError } from '@core-ai/core-ai';

export function wrapGoogleError(error: unknown): ProviderError {
    if (error instanceof ApiError) {
        return new ProviderError(error.message, 'google', error.status, error);
    }

    return new ProviderError(
        error instanceof Error ? error.message : String(error),
        'google',
        undefined,
        error
    );
}
