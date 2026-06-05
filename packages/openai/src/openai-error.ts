import { APIError, APIUserAbortError } from 'openai';
import { AbortedError, ProviderError } from '@core-ai/core-ai';

function isOpenAIAbortError(error: unknown): error is Error {
    return (
        error instanceof APIUserAbortError ||
        (error instanceof Error && error.name === 'AbortError')
    );
}

export function wrapOpenAIError(
    error: unknown,
    provider = 'openai'
): AbortedError | ProviderError {
    if (isOpenAIAbortError(error)) {
        return new AbortedError(error, provider);
    }

    if (error instanceof APIError) {
        return new ProviderError(
            error.message,
            provider,
            error.status,
            error
        );
    }

    return new ProviderError(
        error instanceof Error ? error.message : String(error),
        provider,
        undefined,
        error
    );
}
