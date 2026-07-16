import { ApiError } from '@google/genai';
import {
    AbortedError,
    ProviderError,
    classifyProviderError,
    getErrorMessage,
    getHttpStatusCode,
    getRetryAfterSecondsFromError,
    indicatesModelOverload,
    isAbortErrorByName,
    isRateLimitStatus,
    type ContextLengthSignal,
    type ProviderErrorSignals,
} from '@core-ai/core-ai';

type GoogleApiErrorBody = {
    code?: number | string;
    message?: string;
    status?: string;
};

/**
 * Maps Google GenAI / Vertex SDK errors to classified core-ai provider errors
 * via the shared precedence in `classifyProviderError`.
 *
 * Handles the same signal categories as other providers: abort, context length,
 * overload, rate limit (+ Retry-After), service unavailable, unknown.
 */
export function wrapGoogleError(
    error: unknown,
    provider = 'google'
): AbortedError | ProviderError {
    const message = getErrorMessage(error);
    const statusCode =
        error instanceof ApiError
            ? error.status
            : getHttpStatusCode(error, ['status']);
    const body = tryParseGoogleApiErrorBody(message);
    const effectiveHttp = statusCode ?? toNumericHttpCode(body);

    return classifyProviderError(
        {
            message,
            provider,
            cause: error,
            statusCode: effectiveHttp,
        },
        getGoogleErrorSignals(error, message, effectiveHttp, body)
    );
}

function getGoogleErrorSignals(
    error: unknown,
    message: string,
    statusCode: number | undefined,
    body: GoogleApiErrorBody | null
): ProviderErrorSignals {
    const status = body?.status?.toUpperCase();
    const combinedText = `${body?.message ?? ''} ${message}`;
    const rateLimited = isGoogleRateLimit(statusCode, status);

    return {
        aborted: isAbortErrorByName(error),
        contextLength: getContextLengthSignal(combinedText),
        overloaded: indicatesModelOverload(combinedText, statusCode),
        rateLimit: rateLimited,
        retryAfterSeconds: rateLimited
            ? getRetryAfterSecondsFromError(error)
            : undefined,
        // Generic 5xx use status fallbacks; UNAVAILABLE is explicit.
        serviceUnavailable: status === 'UNAVAILABLE',
    };
}

function isGoogleRateLimit(
    statusCode: number | undefined,
    status: string | undefined
): boolean {
    return isRateLimitStatus(statusCode) || status === 'RESOURCE_EXHAUSTED';
}

function getContextLengthSignal(
    text: string
): true | ContextLengthSignal | undefined {
    const match = text.match(
        /input token count \((\d+)\) exceeds the maximum number of tokens allowed \((\d+)\)/i
    );
    if (match) {
        const actualTokens = match[1];
        const maxTokens = match[2];
        if (actualTokens !== undefined && maxTokens !== undefined) {
            return {
                maxTokens: parseInt(maxTokens, 10),
                actualTokens: parseInt(actualTokens, 10),
            };
        }
    }

    // Detect without inventing token counts when wording is present.
    if (/exceeds the maximum number of tokens allowed/i.test(text)) {
        return true;
    }

    return undefined;
}

function tryParseGoogleApiErrorBody(
    message: string
): GoogleApiErrorBody | null {
    try {
        const parsed: unknown = JSON.parse(message);
        if (
            parsed &&
            typeof parsed === 'object' &&
            'error' in parsed &&
            (parsed as { error: unknown }).error &&
            typeof (parsed as { error: unknown }).error === 'object'
        ) {
            return (parsed as { error: GoogleApiErrorBody }).error;
        }
    } catch {
        // Not JSON
    }
    return null;
}

function toNumericHttpCode(
    body: GoogleApiErrorBody | null
): number | undefined {
    if (body?.code === undefined) {
        return undefined;
    }
    if (typeof body.code === 'number' && Number.isFinite(body.code)) {
        return body.code;
    }
    if (typeof body.code === 'string' && /^\d+$/.test(body.code)) {
        return parseInt(body.code, 10);
    }
    return undefined;
}
