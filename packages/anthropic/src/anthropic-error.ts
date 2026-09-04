import { APIError, APIUserAbortError } from '@anthropic-ai/sdk';
import {
    AbortedError,
    ContextLengthExceededError,
    ModelOverloadedError,
    ProviderError,
    ProviderQuotaExceededError,
    RateLimitError,
    ServiceUnavailableError,
    asRecord,
    getErrorMessage,
    getHttpStatusCode,
    getRetryAfterSecondsFromError,
    getString,
    isAbortErrorByName,
    isRateLimitStatus,
    isTransientUnavailableStatus,
} from '@core-ai/core-ai';

/** Anthropic uses HTTP 529 for overloaded; also honor message cues on 5xx/529. */
const OVERLOAD_MESSAGE_ELIGIBLE_STATUS_CODES = new Set([
    500, 502, 503, 504, 529,
]);

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
    const options = { statusCode, code: errorType, cause: error };

    const contextLength = getContextLengthDetails(providerMessage, errorType);
    if (contextLength) {
        return new ContextLengthExceededError(message, provider, {
            ...options,
            ...contextLength,
        });
    }

    if (
        isAnthropicOverloaded(errorType, providerMessage, message, statusCode)
    ) {
        return new ModelOverloadedError(message, provider, options);
    }

    if (isAnthropicQuotaExceeded(errorType, statusCode)) {
        return new ProviderQuotaExceededError(message, provider, options);
    }

    if (isAnthropicRateLimit(error, statusCode, errorType)) {
        return new RateLimitError(message, provider, {
            ...options,
            retryAfterSeconds: getRetryAfterSecondsFromError(error),
        });
    }

    if (
        isUnavailableStatus(error) ||
        isTransientUnavailableStatus(statusCode) ||
        isAnthropicServerError(errorType)
    ) {
        return new ServiceUnavailableError(message, provider, options);
    }

    return new ProviderError(message, provider, options);
}

/**
 * Server-side failure signalled by error type rather than HTTP status. Streams
 * that are accepted (HTTP 200) and then fail in-band carry only the type.
 */
function isAnthropicServerError(errorType: string | undefined): boolean {
    return errorType === 'api_error' || errorType === 'timeout_error';
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
        statusCode === 529 ||
        errorType === 'overloaded_error' ||
        indicatesAnthropicOverload(
            `${providerMessage ?? ''} ${message}`,
            statusCode
        )
    );
}

function isAnthropicQuotaExceeded(
    errorType: string | undefined,
    statusCode: number | undefined
): boolean {
    return statusCode === 402 || errorType === 'billing_error';
}

/**
 * Message fallback for Anthropic capacity wording. Prefer structured signals
 * (HTTP 529, `overloaded_error`) first. Ignore ordinary 4xx / 429 to avoid
 * false positives.
 */
function indicatesAnthropicOverload(
    text: string,
    statusCode?: number
): boolean {
    if (
        statusCode !== undefined &&
        !OVERLOAD_MESSAGE_ELIGIBLE_STATUS_CODES.has(statusCode)
    ) {
        return false;
    }

    return /\boverloaded\b/i.test(text);
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
    providerMessage: string | undefined,
    errorType: string | undefined
): ContextLengthDetails | undefined {
    // Rate-limit payloads can mention prompts; never treat those as context.
    if (errorType === 'rate_limit_error' || !providerMessage) {
        return undefined;
    }

    if (!/prompt is too long/i.test(providerMessage)) {
        const inputTokensMatch = providerMessage.match(
            /Input tokens exceed the context limit of (\d+)/i
        );
        if (inputTokensMatch?.[1]) {
            return { maxTokens: parseInt(inputTokensMatch[1], 10) };
        }
        return undefined;
    }

    const withMaximum = providerMessage.match(
        /prompt is too long: (\d+) tokens > (\d+) maximum/i
    );
    if (withMaximum) {
        const actualTokens = withMaximum[1];
        const maxTokens = withMaximum[2];
        if (actualTokens !== undefined && maxTokens !== undefined) {
            return {
                maxTokens: parseInt(maxTokens, 10),
                actualTokens: parseInt(actualTokens, 10),
            };
        }
    }

    const withoutMaximum = providerMessage.match(
        /prompt is too long: (\d+) tokens > (\d+)/i
    );
    if (withoutMaximum) {
        const actualTokens = withoutMaximum[1];
        const maxTokens = withoutMaximum[2];
        if (actualTokens !== undefined && maxTokens !== undefined) {
            return {
                maxTokens: parseInt(maxTokens, 10),
                actualTokens: parseInt(actualTokens, 10),
            };
        }
    }

    return {};
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

    const code = typeof body.code === 'number' ? body.code : Number(body.code);
    return code === 429 || body.status?.toUpperCase() === 'RESOURCE_EXHAUSTED';
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
    if (!outer) {
        return undefined;
    }

    const inner = asRecord(outer.error);
    if (inner && ('code' in inner || 'status' in inner)) {
        return inner as { code?: number | string; status?: string };
    }

    // Vertex may use a single-level Google envelope: { error: { code, status } }.
    if ('code' in outer || 'status' in outer) {
        return outer as { code?: number | string; status?: string };
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
        if (typeof error.type === 'string') {
            return error.type;
        }
        if (typeof error.error === 'object' && error.error) {
            return getString(asRecord(error.error), 'type');
        }
    }

    const record = asRecord(error);
    const outer = asRecord(record?.error);
    const inner = asRecord(outer?.error);
    return getString(inner, 'type') ?? getString(outer, 'type');
}
