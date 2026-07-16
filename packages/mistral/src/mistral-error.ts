import {
    RequestAbortedError,
    MistralError,
} from '@mistralai/mistralai/models/errors';
import {
    AbortedError,
    ProviderError,
    asRecord,
    classifyProviderError,
    getErrorMessage,
    getHttpStatusCode,
    getRetryAfterSecondsFromError,
    getString,
    indicatesModelOverload,
    isAbortErrorByName,
    isRateLimitStatus,
    type ContextLengthSignal,
    type ProviderErrorSignals,
} from '@core-ai/core-ai';

/**
 * Maps Mistral SDK errors to classified core-ai provider errors via the
 * shared precedence in `classifyProviderError`.
 *
 * Handles the same signal categories as other providers: abort, context length,
 * overload, rate limit (+ Retry-After), service unavailable, unknown.
 */
export function wrapMistralError(error: unknown): AbortedError | ProviderError {
    const message = getErrorMessage(error);
    const statusCode =
        error instanceof MistralError
            ? error.statusCode
            : getHttpStatusCode(error, ['statusCode', 'status']);

    return classifyProviderError(
        {
            message,
            provider: 'mistral',
            cause: error,
            statusCode,
        },
        getMistralErrorSignals(error, message, statusCode)
    );
}

function getMistralErrorSignals(
    error: unknown,
    message: string,
    statusCode: number | undefined
): ProviderErrorSignals {
    const body = parseErrorBody(error);
    const rateLimited = isMistralRateLimit(statusCode, body?.type);

    return {
        aborted: isMistralAbortError(error),
        contextLength: getContextLengthSignal(body, message),
        overloaded: indicatesModelOverload(message, statusCode),
        rateLimit: rateLimited,
        retryAfterSeconds: rateLimited
            ? getRetryAfterSecondsFromError(error)
            : undefined,
        // Generic 5xx use status fallbacks in classifyProviderError.
    };
}

function isMistralAbortError(error: unknown): boolean {
    return (
        error instanceof RequestAbortedError || isAbortErrorByName(error)
    );
}

function isMistralRateLimit(
    statusCode: number | undefined,
    errorType: string | undefined
): boolean {
    return isRateLimitStatus(statusCode) || errorType === 'rate_limit_error';
}

function getContextLengthSignal(
    body: { message?: string; type?: string } | undefined,
    message: string
): true | ContextLengthSignal | undefined {
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
        return true;
    }

    const actualTokens = match[1];
    const maxTokens = match[2];
    if (actualTokens === undefined || maxTokens === undefined) {
        return true;
    }

    return {
        maxTokens: parseInt(maxTokens, 10),
        actualTokens: parseInt(actualTokens, 10),
    };
}

function parseErrorBody(
    error: unknown
): { message?: string; type?: string } | undefined {
    const record = asRecord(error);
    if (!record || !('body' in record)) {
        // Some SDK shapes put type/message on the error itself.
        const type = getString(record, 'type');
        const message = getString(record, 'message');
        if (type || message) {
            return { type, message };
        }
        return undefined;
    }

    const body = record.body;
    if (typeof body !== 'string') {
        if (body && typeof body === 'object') {
            const bodyRecord = asRecord(body);
            return {
                message: getString(bodyRecord, 'message'),
                type: getString(bodyRecord, 'type'),
            };
        }
        return undefined;
    }

    try {
        const parsed: unknown = JSON.parse(body);
        const parsedRecord = asRecord(parsed);
        if (parsedRecord) {
            return {
                message: getString(parsedRecord, 'message'),
                type: getString(parsedRecord, 'type'),
            };
        }
    } catch {
        // ignore
    }
    return undefined;
}
