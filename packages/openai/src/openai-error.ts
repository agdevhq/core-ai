import { APIError, APIUserAbortError } from 'openai';
import {
    AbortedError,
    ContextLengthExceededError,
    ProviderError,
    RateLimitError,
    ServiceUnavailableError,
} from '@core-ai/core-ai';

function isOpenAIAbortError(error: unknown): error is Error {
    return (
        error instanceof APIUserAbortError ||
        (error instanceof Error && error.name === 'AbortError')
    );
}

/**
 * Maps OpenAI / Azure OpenAI / OpenAI-compatible SDK errors to classified
 * core-ai provider errors.
 *
 * Classification precedence:
 * 1. Abort
 * 2. Context length (error codes + token-limit message patterns)
 * 3. Azure backend 429 capacity quirk → service unavailable
 * 4. HTTP 429 → rate limit (with Retry-After when present)
 * 5. HTTP 503 → service unavailable
 * 6. Otherwise → ProviderError with code `unknown`
 */
export function wrapOpenAIError(
    error: unknown,
    provider = 'openai'
): AbortedError | ProviderError {
    if (isOpenAIAbortError(error)) {
        return new AbortedError(error, provider);
    }

    const message = getErrorMessage(error);
    const statusCode = getStatusCode(error);

    const contextLengthError = tryContextLengthExceededError(
        error,
        message,
        provider,
        statusCode
    );
    if (contextLengthError) {
        return contextLengthError;
    }

    if (statusCode === 429 && isAzureOpenAIBackendCapacityError(error)) {
        return new ServiceUnavailableError(message, provider, {
            statusCode,
            cause: error,
        });
    }

    if (statusCode === 429) {
        return new RateLimitError(message, provider, {
            statusCode,
            cause: error,
            retryAfterSeconds: getRetryAfterSeconds(error),
        });
    }

    if (statusCode === 503) {
        return new ServiceUnavailableError(message, provider, {
            statusCode,
            cause: error,
        });
    }

    return new ProviderError(message, provider, {
        statusCode,
        cause: error,
    });
}

function tryContextLengthExceededError(
    error: unknown,
    message: string,
    provider: string,
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
            return new ContextLengthExceededError(message, provider, {
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

    const stringExceededPattern =
        /Expected a string with maximum length (\d+), but got a string with length (\d+) instead\./;
    const match = providerMessage.match(stringExceededPattern);
    if (!match) {
        return undefined;
    }

    const maxLength = match[1];
    const actualLength = match[2];
    if (maxLength === undefined || actualLength === undefined) {
        return undefined;
    }

    return new ContextLengthExceededError(message, provider, {
        statusCode,
        cause: error,
        maxTokens: parseInt(maxLength, 10),
        actualTokens: parseInt(actualLength, 10),
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

/**
 * Azure OpenAI sometimes returns HTTP 429 with `invalid_request_error` and
 * message `"Backend error."` for capacity issues rather than a true rate limit.
 */
function isAzureOpenAIBackendCapacityError(error: unknown): boolean {
    const type = getProviderErrorType(error);
    const providerMessage = getProviderMessage(error);

    return (
        type === 'invalid_request_error' &&
        providerMessage?.toLowerCase() === 'backend error.'
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
        const nested = asRecord(error.error);
        const nestedMessage = getString(nested, 'message');
        if (nestedMessage) {
            return nestedMessage;
        }
        return error.message;
    }

    const record = asRecord(error);
    if (!record) {
        return undefined;
    }

    const nested = asRecord(record.error);
    return getString(nested, 'message') ?? getString(record, 'message');
}

function getProviderErrorCode(error: unknown): string | undefined {
    if (error instanceof APIError) {
        if (typeof error.code === 'string') {
            return error.code;
        }
        const nested = asRecord(error.error);
        return getString(nested, 'code');
    }

    const record = asRecord(error);
    if (!record) {
        return undefined;
    }

    const nested = asRecord(record.error);
    return getString(record, 'code') ?? getString(nested, 'code');
}

function getProviderErrorType(error: unknown): string | undefined {
    if (error instanceof APIError) {
        if (typeof error.type === 'string') {
            return error.type;
        }
        const nested = asRecord(error.error);
        return getString(nested, 'type');
    }

    const record = asRecord(error);
    if (!record) {
        return undefined;
    }

    const nested = asRecord(record.error);
    return getString(record, 'type') ?? getString(nested, 'type');
}

function getRetryAfterSeconds(error: unknown): number | undefined {
    const headers = getHeaders(error);
    if (!headers) {
        return undefined;
    }

    let retryAfter: string | undefined;
    if (typeof (headers as Headers).get === 'function') {
        retryAfter =
            (headers as Headers).get('retry-after') ?? undefined;
    } else if (
        typeof headers === 'object' &&
        'retry-after' in headers &&
        typeof (headers as Record<string, unknown>)['retry-after'] === 'string'
    ) {
        retryAfter = (headers as Record<string, string>)['retry-after'];
    }

    if (retryAfter === undefined) {
        return undefined;
    }

    const parsed = parseInt(retryAfter, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function getHeaders(
    error: unknown
): Headers | Record<string, string> | undefined {
    if (error instanceof APIError && error.headers) {
        return error.headers;
    }
    if (
        error instanceof Object &&
        'headers' in error &&
        error.headers &&
        typeof error.headers === 'object'
    ) {
        return error.headers as Headers | Record<string, string>;
    }
    return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    if (value && typeof value === 'object') {
        return value as Record<string, unknown>;
    }
    return undefined;
}

function getString(
    source: Record<string, unknown> | undefined,
    key: string
): string | undefined {
    if (!source) {
        return undefined;
    }
    const value = source[key];
    return typeof value === 'string' ? value : undefined;
}
