import { APIError, APIUserAbortError } from '@anthropic-ai/sdk';
import {
    AbortedError,
    ContextLengthExceededError,
    ModelOverloadedError,
    ProviderError,
    RateLimitError,
    ServiceUnavailableError,
    asRecord,
    getErrorMessage,
    getHttpStatusCode,
    getRetryAfterSecondsFromError,
    getString,
    indicatesModelOverload,
    isAbortErrorByName,
    isOverloadedStatus,
    isRateLimitStatus,
    isTransientUnavailableStatus,
} from '@core-ai/core-ai';

type ContextLengthDetails = {
    maxTokens?: number;
    actualTokens?: number;
};

/**
 * Maps Anthropic / Anthropic Vertex SDK errors to core-ai provider error
 * subclasses. Classification is owned by this wrapper.
 */
export function wrapAnthropicError(
    error: unknown,
    provider = 'anthropic'
): AbortedError | ProviderError {
    if (isAnthropicAbortError(error)) {
        return new AbortedError(error, provider);
    }

    const message = getErrorMessage(error);
    const statusCode =
        error instanceof APIError
            ? error.status
            : getHttpStatusCode(error, ['status']);
    const providerMessage = getAnthropicErrorMessage(error);
    const errorType = getAnthropicErrorType(error);
    const options = { statusCode, cause: error };

    const contextLength = getContextLengthDetails(providerMessage);
    if (contextLength) {
        return new ContextLengthExceededError(message, provider, {
            ...options,
            ...contextLength,
        });
    }

    if (
        isAnthropicOverloaded(
            errorType,
            providerMessage,
            message,
            statusCode
        )
    ) {
        return new ModelOverloadedError(message, provider, options);
    }

    if (isAnthropicRateLimit(error, statusCode, errorType)) {
        return new RateLimitError(message, provider, {
            ...options,
            retryAfterSeconds: getRetryAfterSecondsFromError(error),
        });
    }

    if (isUnavailableStatus(error) || isTransientUnavailableStatus(statusCode)) {
        return new ServiceUnavailableError(message, provider, options);
    }

    return new ProviderError(message, provider, options);
}

function isAnthropicAbortError(error: unknown): boolean {
    return error instanceof APIUserAbortError || isAbortErrorByName(error);
}

function isAnthropicOverloaded(
    errorType: string | undefined,
    providerMessage: string | undefined,
    message: string,
    statusCode: number | undefined
): boolean {
    return (
        isOverloadedStatus(statusCode) ||
        errorType === 'overloaded_error' ||
        indicatesModelOverload(
            `${providerMessage ?? ''} ${message}`,
            statusCode
        )
    );
}

function isAnthropicRateLimit(
    error: unknown,
    statusCode: number | undefined,
    errorType: string | undefined
): boolean {
    return (
        isRateLimitStatus(statusCode) ||
        errorType === 'rate_limit_error' ||
        isResourceExhaustedError(error)
    );
}

function getContextLengthDetails(
    providerMessage: string | undefined
): ContextLengthDetails | undefined {
    if (!providerMessage?.includes('prompt is too long')) {
        return undefined;
    }

    const match = providerMessage.match(
        /prompt is too long: (\d+) tokens > (\d+) maximum/
    );
    if (!match) {
        return {};
    }

    const actualTokens = match[1];
    const maxTokens = match[2];
    if (actualTokens === undefined || maxTokens === undefined) {
        return {};
    }

    return {
        maxTokens: parseInt(maxTokens, 10),
        actualTokens: parseInt(actualTokens, 10),
    };
}

/**
 * Vertex Anthropic may nest a Google API error body with
 * `RESOURCE_EXHAUSTED` / HTTP 429.
 */
function isResourceExhaustedError(error: unknown): boolean {
    const body = getNestedGoogleApiErrorBody(error);
    if (!body) {
        return false;
    }

    const code =
        typeof body.code === 'number' ? body.code : Number(body.code);
    return (
        code === 429 || body.status?.toUpperCase() === 'RESOURCE_EXHAUSTED'
    );
}

function isUnavailableStatus(error: unknown): boolean {
    const body = getNestedGoogleApiErrorBody(error);
    return body?.status?.toUpperCase() === 'UNAVAILABLE';
}

function getNestedGoogleApiErrorBody(
    error: unknown
): { code?: number | string; status?: string } | undefined {
    const record = asRecord(error);
    const outer = asRecord(record?.error);
    const inner = asRecord(outer?.error);
    if (inner && ('code' in inner || 'status' in inner)) {
        return inner as { code?: number | string; status?: string };
    }
    return undefined;
}

function getAnthropicErrorMessage(error: unknown): string | undefined {
    if (error instanceof APIError) {
        const nested = asRecord(error.error);
        return getString(nested, 'message') ?? error.message;
    }

    const record = asRecord(error);
    const outer = asRecord(record?.error);
    const inner = asRecord(outer?.error);
    return (
        getString(inner, 'message') ??
        getString(outer, 'message') ??
        getString(record, 'message')
    );
}

function getAnthropicErrorType(error: unknown): string | undefined {
    if (error instanceof APIError) {
        if (typeof error.error === 'object' && error.error) {
            return getString(asRecord(error.error), 'type');
        }
    }

    const record = asRecord(error);
    const outer = asRecord(record?.error);
    const inner = asRecord(outer?.error);
    return getString(inner, 'type') ?? getString(outer, 'type');
}
