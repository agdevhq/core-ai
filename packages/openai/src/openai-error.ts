import { APIError, APIUserAbortError } from 'openai';
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
    isAbortErrorByName,
    isRateLimitStatus,
    isTransientUnavailableStatus,
} from '@core-ai/core-ai';

const CONTEXT_LENGTH_ERROR_CODES = new Set([
    'context_length_exceeded',
    'string_above_max_length',
]);

const TOKEN_LIMIT_PATTERNS = [
    /maximum context length is (\d+) tokens.*resulted in (\d+) tokens/i,
    /maximum context length is (\d+) tokens.*you requested (\d+) tokens/i,
    /configured limit of (\d+) tokens.*resulted in (\d+) tokens/i,
];

const CONTEXT_LENGTH_MESSAGE_PATTERN = /\binput exceeds the context window\b/i;

/**
 * OpenAI / Azure capacity wording. Only apply on 5xx (not ordinary 4xx / 429).
 */
const OVERLOAD_MESSAGE_ELIGIBLE_STATUS_CODES = new Set([500, 502, 503, 504]);

type ContextLengthDetails = {
    maxTokens?: number;
    actualTokens?: number;
};

/**
 * Maps OpenAI / Azure OpenAI / OpenAI-compatible SDK errors to core-ai
 * provider error subclasses. Classification is owned by this wrapper.
 */
export function wrapOpenAIError(
    error: unknown,
    provider = 'openai'
): AbortedError | ProviderError {
    if (isOpenAIAbortError(error)) {
        return new AbortedError(error, provider);
    }

    const message = getErrorMessage(error);
    const statusCode =
        error instanceof APIError
            ? error.status
            : getHttpStatusCode(error, ['status']);
    const options = {
        statusCode,
        code: getProviderErrorCode(error) ?? getProviderErrorType(error),
        cause: error,
    };

    const contextLength = getContextLengthDetails(error, message);
    if (contextLength) {
        return new ContextLengthExceededError(message, provider, {
            ...options,
            ...contextLength,
        });
    }

    if (isAzureOpenAIBackendCapacityError(error)) {
        return new ServiceUnavailableError(message, provider, options);
    }

    if (isOpenAIInsufficientQuota(error)) {
        return new ProviderError(message, provider, options);
    }

    if (isAzureOpenAINoCapacity(error)) {
        return new ModelOverloadedError(message, provider, options);
    }

    if (isOpenAIOverloaded(error, message, statusCode)) {
        return new ModelOverloadedError(message, provider, options);
    }

    if (isOpenAIRateLimit(error, statusCode)) {
        return new RateLimitError(message, provider, {
            ...options,
            retryAfterSeconds: getRetryAfterSecondsFromError(error),
        });
    }

    if (
        isTransientUnavailableStatus(statusCode) ||
        isOpenAIServerError(error)
    ) {
        return new ServiceUnavailableError(message, provider, options);
    }

    return new ProviderError(message, provider, options);
}

/**
 * Server-side failure signalled by code/type rather than HTTP status. Streams
 * that are accepted (HTTP 200) and then fail in-band carry only the code.
 */
function isOpenAIServerError(error: unknown): boolean {
    const code = getProviderErrorCode(error);
    const type = getProviderErrorType(error);
    return (
        code === 'server_error' ||
        code === 'service_unavailable' ||
        type === 'server_error'
    );
}

function isOpenAIAbortError(error: unknown): error is Error {
    return error instanceof APIUserAbortError || isAbortErrorByName(error);
}

function isOpenAIRateLimit(
    error: unknown,
    statusCode: number | undefined
): boolean {
    if (isRateLimitStatus(statusCode)) {
        return true;
    }

    const code = getProviderErrorCode(error);
    const type = getProviderErrorType(error);
    return code === 'rate_limit_exceeded' || type === 'rate_limit_error';
}

function isOpenAIOverloaded(
    error: unknown,
    message: string,
    statusCode: number | undefined
): boolean {
    const providerMessage = getProviderMessage(error) ?? '';
    return indicatesOpenAIOverload(`${providerMessage} ${message}`, statusCode);
}

function indicatesOpenAIOverload(text: string, statusCode?: number): boolean {
    if (
        statusCode !== undefined &&
        !OVERLOAD_MESSAGE_ELIGIBLE_STATUS_CODES.has(statusCode)
    ) {
        return false;
    }

    const lower = text.toLowerCase();
    return (
        /\boverloaded\b/.test(lower) ||
        /\bhigh demand\b/.test(lower) ||
        /\brunning out of capacity\b/.test(lower) ||
        /\bspikes in demand\b/.test(lower)
    );
}

function getContextLengthDetails(
    error: unknown,
    fallbackMessage: string
): ContextLengthDetails | undefined {
    const providerMessage = getProviderMessage(error) ?? fallbackMessage;
    const code = getProviderErrorCode(error);
    const isKnownContextLengthCode =
        code !== undefined && CONTEXT_LENGTH_ERROR_CODES.has(code);

    const tokenCounts = matchTokenLimitCounts(providerMessage);
    if (tokenCounts) {
        return tokenCounts;
    }

    if (
        !isKnownContextLengthCode &&
        !CONTEXT_LENGTH_MESSAGE_PATTERN.test(providerMessage)
    ) {
        return undefined;
    }

    // Known context-length code or wording without parseable token counts.
    return {};
}

function matchTokenLimitCounts(
    providerMessage: string
): ContextLengthDetails | undefined {
    for (const pattern of TOKEN_LIMIT_PATTERNS) {
        const match = providerMessage.match(pattern);
        if (!match) {
            continue;
        }
        const maxTokens = match[1];
        const actualTokens = match[2];
        if (maxTokens === undefined || actualTokens === undefined) {
            continue;
        }
        return {
            maxTokens: parseInt(maxTokens, 10),
            actualTokens: parseInt(actualTokens, 10),
        };
    }
    return undefined;
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

/**
 * Billing / plan quota — HTTP 429 but not retryable. OpenAI uses
 * `insufficient_quota`; some OpenAI-compatible endpoints report
 * `credit_balance_exhausted`.
 */
function isOpenAIInsufficientQuota(error: unknown): boolean {
    const code = getProviderErrorCode(error);
    const type = getProviderErrorType(error);
    return (
        code === 'insufficient_quota' ||
        type === 'insufficient_quota' ||
        code === 'credit_balance_exhausted'
    );
}

/** Azure system capacity on 429 — overload, not org rate limit. */
function isAzureOpenAINoCapacity(error: unknown): boolean {
    return getProviderErrorCode(error) === 'NoCapacity';
}

function getProviderMessage(error: unknown): string | undefined {
    if (error instanceof APIError) {
        const nested = asRecord(error.error);
        return getString(nested, 'message') ?? error.message;
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
