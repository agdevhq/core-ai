import { APIError, APIUserAbortError } from 'openai';
import {
    AbortedError,
    ContextLengthExceededError,
    ProviderError,
    RateLimitError,
    ServiceUnavailableError,
} from '@core-ai/core-ai';

/**
 * Maps Kimi (Moonshot) OpenAI-compatible SDK errors to classified core-ai
 * provider errors. Uses the same classification contract as OpenAI-compatible
 * providers (context length, rate limit, service unavailable).
 */
export function wrapKimiError(error: unknown): AbortedError | ProviderError {
    if (isOpenAIAbortError(error)) {
        return new AbortedError(error, 'kimi');
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
        return new RateLimitError(message, 'kimi', {
            statusCode,
            cause: error,
            retryAfterSeconds: getRetryAfterSeconds(error),
        });
    }

    if (statusCode === 503) {
        return new ServiceUnavailableError(message, 'kimi', {
            statusCode,
            cause: error,
        });
    }

    return new ProviderError(message, 'kimi', {
        statusCode,
        cause: error,
    });
}

function isOpenAIAbortError(error: unknown): error is Error {
    return (
        error instanceof APIUserAbortError ||
        (error instanceof Error && error.name === 'AbortError')
    );
}

function tryContextLengthExceededError(
    error: unknown,
    message: string,
    statusCode: number | undefined
): ContextLengthExceededError | undefined {
    const providerMessage = getProviderMessage(error) ?? message;
    const code = getProviderErrorCode(error);

    const contextLengthErrorCodes = [
        'context_length_exceeded',
        'string_above_max_length',
    ];
    const isKnownContextLengthCode =
        code !== undefined && contextLengthErrorCodes.includes(code);

    const tokenLimitPatterns = [
        /maximum context length is (\d+) tokens.*resulted in (\d+) tokens/i,
        /maximum context length is (\d+) tokens.*you requested (\d+) tokens/i,
        /configured limit of (\d+) tokens.*resulted in (\d+) tokens/i,
    ];

    for (const pattern of tokenLimitPatterns) {
        const match = providerMessage.match(pattern);
        if (
            match &&
            (isKnownContextLengthCode || isTokenLimitMessage(providerMessage))
        ) {
            const maxTokens = match[1];
            const actualTokens = match[2];
            if (maxTokens === undefined || actualTokens === undefined) {
                continue;
            }
            return new ContextLengthExceededError(message, 'kimi', {
                statusCode,
                cause: error,
                maxTokens: parseInt(maxTokens, 10),
                actualTokens: parseInt(actualTokens, 10),
            });
        }
    }

    if (!isKnownContextLengthCode) {
        return undefined;
    }

    // Known context-length code without parseable counts — still classify.
    return new ContextLengthExceededError(message, 'kimi', {
        statusCode,
        cause: error,
    });
}

function isTokenLimitMessage(message: string): boolean {
    const normalizedMessage = message.toLowerCase();
    return (
        normalizedMessage.includes('token') &&
        (normalizedMessage.includes('context length') ||
            normalizedMessage.includes('configured limit'))
    );
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function getStatusCode(error: unknown): number | undefined {
    if (error instanceof APIError) {
        return error.status;
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

function getProviderMessage(error: unknown): string | undefined {
    if (error instanceof APIError) {
        const nested =
            error.error && typeof error.error === 'object'
                ? (error.error as Record<string, unknown>)
                : undefined;
        if (nested && typeof nested.message === 'string') {
            return nested.message;
        }
        return error.message;
    }

    if (error instanceof Object && 'error' in error) {
        const nested = (error as { error?: unknown }).error;
        if (nested && typeof nested === 'object' && 'message' in nested) {
            const msg = (nested as { message: unknown }).message;
            if (typeof msg === 'string') {
                return msg;
            }
        }
    }

    return undefined;
}

function getProviderErrorCode(error: unknown): string | undefined {
    if (error instanceof APIError) {
        if (typeof error.code === 'string') {
            return error.code;
        }
        if (error.error && typeof error.error === 'object') {
            const code = (error.error as { code?: unknown }).code;
            return typeof code === 'string' ? code : undefined;
        }
    }

    if (error instanceof Object) {
        if ('code' in error && typeof (error as { code: unknown }).code === 'string') {
            return (error as { code: string }).code;
        }
        if ('error' in error && typeof (error as { error: unknown }).error === 'object') {
            const nested = (error as { error: { code?: unknown } }).error;
            return typeof nested?.code === 'string' ? nested.code : undefined;
        }
    }

    return undefined;
}

function getRetryAfterSeconds(error: unknown): number | undefined {
    if (!(error instanceof APIError) || !error.headers) {
        return undefined;
    }

    const retryAfter = error.headers.get('retry-after');
    if (!retryAfter) {
        return undefined;
    }

    const parsed = parseInt(retryAfter, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
}
