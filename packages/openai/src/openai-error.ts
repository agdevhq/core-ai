import { APIError, APIUserAbortError } from 'openai';
import {
    AbortedError,
    ProviderError,
    asRecord,
    classifyProviderError,
    getErrorMessage,
    getHttpStatusCode,
    getString,
    indicatesModelOverload,
    isAbortErrorByName,
    parseRetryAfterSeconds,
    type ContextLengthSignal,
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

/**
 * Maps OpenAI / Azure OpenAI / OpenAI-compatible SDK errors to classified
 * core-ai provider errors via the shared precedence in `classifyProviderError`.
 */
export function wrapOpenAIError(
    error: unknown,
    provider = 'openai'
): AbortedError | ProviderError {
    const message = getErrorMessage(error);
    const statusCode =
        error instanceof APIError
            ? error.status
            : getHttpStatusCode(error, ['status']);

    return classifyProviderError({
        message,
        provider,
        cause: error,
        statusCode,
        aborted: isOpenAIAbortError(error),
        contextLength: getContextLengthSignal(error, message),
        overloaded: indicatesModelOverload(
            `${getProviderMessage(error) ?? ''} ${message}`,
            statusCode
        ),
        rateLimit: statusCode === 429 && !isAzureOpenAIBackendCapacityError(error),
        retryAfterSeconds:
            statusCode === 429 ? getRetryAfterSeconds(error) : undefined,
        serviceUnavailable: isAzureOpenAIBackendCapacityError(error),
    });
}

function isOpenAIAbortError(error: unknown): error is Error {
    return error instanceof APIUserAbortError || isAbortErrorByName(error);
}

function getContextLengthSignal(
    error: unknown,
    fallbackMessage: string
): true | ContextLengthSignal | undefined {
    const providerMessage = getProviderMessage(error) ?? fallbackMessage;
    const code = getProviderErrorCode(error);
    const isKnownContextLengthCode =
        code !== undefined && CONTEXT_LENGTH_ERROR_CODES.has(code);

    const tokenCounts = matchTokenLimitCounts(providerMessage);
    if (tokenCounts) {
        return tokenCounts;
    }

    if (!isKnownContextLengthCode) {
        return undefined;
    }

    // Known context-length / string-max codes without parseable token counts.
    // Do not map character lengths onto maxTokens/actualTokens.
    return true;
}

function matchTokenLimitCounts(
    providerMessage: string
): ContextLengthSignal | undefined {
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

function getRetryAfterSeconds(error: unknown): number | undefined {
    if (error instanceof APIError && error.headers) {
        return parseRetryAfterSeconds(error.headers);
    }

    const record = asRecord(error);
    if (!record?.headers || typeof record.headers !== 'object') {
        return undefined;
    }

    return parseRetryAfterSeconds(
        record.headers as Headers | Record<string, string>
    );
}
