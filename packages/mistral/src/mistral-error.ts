import { MistralError } from '@mistralai/mistralai/models/errors';
import { ProviderError } from '@core-ai/core-ai';

export function wrapMistralError(error: unknown): ProviderError {
    if (error instanceof MistralError) {
        return new ProviderError(
            error.message,
            'mistral',
            error.statusCode,
            error
        );
    }

    return new ProviderError(
        error instanceof Error ? error.message : String(error),
        'mistral',
        undefined,
        error
    );
}
