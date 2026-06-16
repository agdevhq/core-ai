import { APIError, APIUserAbortError } from 'openai';
import { AbortedError, ProviderError } from '@core-ai/core-ai';

function isOpenAIAbortError(error: unknown): error is Error {
    return (
        error instanceof APIUserAbortError ||
        (error instanceof Error && error.name === 'AbortError')
    );
}

export function wrapKimiError(error: unknown): AbortedError | ProviderError {
    if (isOpenAIAbortError(error)) {
        return new AbortedError(error, 'kimi');
    }

    if (error instanceof APIError) {
        return new ProviderError(
            error.message,
            'kimi',
            error.status,
            error
        );
    }

    return new ProviderError(
        error instanceof Error ? error.message : String(error),
        'kimi',
        undefined,
        error
    );
}
