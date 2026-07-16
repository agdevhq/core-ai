import {
    RequestAbortedError,
    MistralError,
} from '@mistralai/mistralai/models/errors';
import {
    AbortedError,
    ContextLengthExceededError,
    ProviderError,
    RateLimitError,
    ServiceUnavailableError,
} from '@core-ai/core-ai';

/**
 * Maps Mistral SDK errors to classified core-ai provider errors.
 *
 * Classification precedence:
 * 1. Abort
 * 2. Context length ("too large for model" + token counts)
 * 3. HTTP 429 → rate limit
 * 4. HTTP 503 → service unavailable
 * 5. Otherwise → ProviderError with code `unknown`
 */
export function wrapMistralError(error: unknown): AbortedError | ProviderError {
    if (
        error instanceof RequestAbortedError ||
        (error instanceof Error && error.name === 'AbortError')
    ) {
        return new AbortedError(error, 'mistral');
    }

    const message = getErrorMessage(error);
    const statusCode = getStatusCode(error);

    const contextLengthError = tryContextLengthExceededError(
        error,
        message,
        statusCode
    );
    if (contextLengthError) {
        return contextLengthError;
    }

    if (statusCode === 429) {
        return new RateLimitError(message, 'mistral', {
            statusCode,
            cause: error,
        });
    }

    if (statusCode === 503) {
        return new ServiceUnavailableError(message, 'mistral', {
            statusCode,
            cause: error,
        });
    }

    return new ProviderError(message, 'mistral', {
        statusCode,
        cause: error,
    });
}

function tryContextLengthExceededError(
    error: unknown,
    message: string,
    statusCode: number | undefined
): ContextLengthExceededError | undefined {
    const body = parseErrorBody(error);
    const errorMessage = body?.message ?? message;
    const errorType = body?.type;

    const isContextType =
        errorType === 'invalid_request_error' ||
        errorType === 'invalid_request_invalid_args' ||
        errorType === undefined;

    if (
        !isContextType ||
        !errorMessage.toLowerCase().includes('too large for model')
    ) {
        return undefined;
    }

    const match = errorMessage.match(
        /(\d+)\s*tokens.*too large for model with (\d+) maximum context length/
    );
    if (!match) {
        return new ContextLengthExceededError(message, 'mistral', {
            statusCode,
            cause: error,
        });
    }

    const actualTokens = match[1];
    const maxTokens = match[2];
    if (actualTokens === undefined || maxTokens === undefined) {
        return new ContextLengthExceededError(message, 'mistral', {
            statusCode,
            cause: error,
        });
    }

    return new ContextLengthExceededError(message, 'mistral', {
        statusCode,
        cause: error,
        maxTokens: parseInt(maxTokens, 10),
        actualTokens: parseInt(actualTokens, 10),
    });
}

function parseErrorBody(
    error: unknown
): { message?: string; type?: string } | undefined {
    if (!(error instanceof Object) || !('body' in error)) {
        return undefined;
    }

    const body = (error as { body: unknown }).body;
    if (typeof body !== 'string') {
        if (body && typeof body === 'object') {
            return body as { message?: string; type?: string };
        }
        return undefined;
    }

    try {
        const parsed: unknown = JSON.parse(body);
        if (parsed && typeof parsed === 'object') {
            return parsed as { message?: string; type?: string };
        }
    } catch {
        // ignore
    }
    return undefined;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function getStatusCode(error: unknown): number | undefined {
    if (error instanceof MistralError) {
        return error.statusCode;
    }
    if (
        error instanceof Object &&
        'statusCode' in error &&
        typeof (error as { statusCode: unknown }).statusCode === 'number'
    ) {
        const status = (error as { statusCode: number }).statusCode;
        return Number.isFinite(status) ? status : undefined;
    }
    if (
        error instanceof Object &&
        'status' in error &&
        typeof (error as { status: unknown }).status === 'number'
    ) {
        const status = (error as { status: number }).status;
        return Number.isFinite(status) ? status : undefined;
    }
    return undefined;
}
