import { ApiError } from '@google/genai';
import {
    AbortedError,
    ContextLengthExceededError,
    ModelOverloadedError,
    ProviderError,
    RateLimitError,
    ServiceUnavailableError,
    getErrorMessage,
    getHttpStatusCode,
    getRetryAfterSecondsFromError,
    indicatesModelOverload,
    isAbortErrorByName,
    isRateLimitStatus,
    isTransientUnavailableStatus,
} from '@core-ai/core-ai';

type GoogleApiErrorBody = {
    code?: number | string;
    message?: string;
    status?: string;
};

type ContextLengthDetails = {
    maxTokens?: number;
    actualTokens?: number;
};

/**
 * Maps Google GenAI / Vertex SDK errors to core-ai provider error subclasses.
 * Classification is owned by this wrapper.
 */
export function wrapGoogleError(
    error: unknown,
    provider = 'google'
): AbortedError | ProviderError {
    if (isGoogleAbortError(error)) {
        return new AbortedError(error, provider);
    }

    const message = getErrorMessage(error);
    const statusCode =
        error instanceof ApiError
            ? error.status
            : getHttpStatusCode(error, ['status']);
    const body = tryParseGoogleApiErrorBody(message);
    const effectiveHttp = statusCode ?? toNumericHttpCode(body);
    const options = { statusCode: effectiveHttp, cause: error };
    const status = body?.status?.toUpperCase();
    const combinedText = `${body?.message ?? ''} ${message}`;

    const contextLength = getContextLengthDetails(combinedText);
    if (contextLength) {
        return new ContextLengthExceededError(message, provider, {
            ...options,
            ...contextLength,
        });
    }

    if (indicatesModelOverload(combinedText, effectiveHttp)) {
        return new ModelOverloadedError(message, provider, options);
    }

    if (isGoogleRateLimit(effectiveHttp, status)) {
        return new RateLimitError(message, provider, {
            ...options,
            retryAfterSeconds: getRetryAfterSecondsFromError(error),
        });
    }

    if (status === 'UNAVAILABLE' || isTransientUnavailableStatus(effectiveHttp)) {
        return new ServiceUnavailableError(message, provider, options);
    }

    return new ProviderError(message, provider, options);
}

/**
 * Google requests pass `abortSignal`; the SDK may surface cancellation as
 * `AbortError` by name, or as a plain/ApiError whose message indicates abort.
 */
function isGoogleAbortError(error: unknown): boolean {
    if (isAbortErrorByName(error)) {
        return true;
    }

    const message = getErrorMessage(error).toLowerCase();
    return (
        message.includes('the operation was aborted') ||
        message.includes('this operation was aborted') ||
        message.includes('request aborted') ||
        message.includes('the request was aborted')
    );
}

function isGoogleRateLimit(
    statusCode: number | undefined,
    status: string | undefined
): boolean {
    return isRateLimitStatus(statusCode) || status === 'RESOURCE_EXHAUSTED';
}

function getContextLengthDetails(
    text: string
): ContextLengthDetails | undefined {
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
        return {};
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
