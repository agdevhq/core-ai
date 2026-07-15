import {
    RequestAbortedError,
    MistralError,
} from '@mistralai/mistralai/models/errors';
import { AbortedError, ProviderError } from '@core-ai/core-ai';

export function wrapMistralError(error: unknown): AbortedError | ProviderError {
    if (
        error instanceof RequestAbortedError ||
        (error instanceof Error && error.name === 'AbortError')
    ) {
        return new AbortedError(error, 'mistral');
    }

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
