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
    isAbortErrorByName,
    isRateLimitStatus,
    isTransientUnavailableStatus,
} from '@core-ai/core-ai';

/** Only honor capacity wording on 5xx — not ordinary 4xx / 429. */
const OVERLOAD_MESSAGE_ELIGIBLE_STATUS_CODES = new Set([500, 502, 503, 504]);

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
    const status = body?.status?.toUpperCase();
    const options = { statusCode: effectiveHttp, code: status, cause: error };
    const combinedText = `${body?.message ?? ''} ${message}`;

    const contextLength = getContextLengthDetails(combinedText);
    if (contextLength) {
        return new ContextLengthExceededError(message, provider, {
            ...options,
            ...contextLength,
        });
    }

    if (indicatesGoogleOverload(combinedText, effectiveHttp)) {
        return new ModelOverloadedError(message, provider, options);
    }

    if (isGoogleRateLimit(effectiveHttp, status)) {
        return new RateLimitError(message, provider, {
            ...options,
            retryAfterSeconds:
                getRetryAfterSecondsFromError(error) ??
                parseRetryAfterFromMessage(combinedText),
        });
    }

    if (
        status === 'UNAVAILABLE' ||
        isTransientUnavailableStatus(effectiveHttp)
    ) {
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

function indicatesGoogleOverload(text: string, statusCode?: number): boolean {
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
        /\bthrottled\b/.test(lower) ||
        /\brunning out of capacity\b/.test(lower) ||
        /\bno capacity available\b/.test(lower)
    );
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

    const alternate = text.match(
        /input token count is (\d+) but model only supports up to (\d+)/i
    );
    if (alternate) {
        const actualTokens = alternate[1];
        const maxTokens = alternate[2];
        if (actualTokens !== undefined && maxTokens !== undefined) {
            return {
                maxTokens: parseInt(maxTokens, 10),
                actualTokens: parseInt(actualTokens, 10),
            };
        }
    }

    // Detect without inventing token counts when wording is present.
    if (
        /exceeds the maximum number of tokens allowed/i.test(text) ||
        /unable to submit request because the input token count/i.test(text)
    ) {
        return {};
    }

    return undefined;
}

function tryParseGoogleApiErrorBody(
    message: string
): GoogleApiErrorBody | null {
    const jsonStart = message.indexOf('{');
    const candidate = jsonStart >= 0 ? message.slice(jsonStart) : message;

    try {
        const parsed: unknown = JSON.parse(candidate);
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

function parseRetryAfterFromMessage(text: string): number | undefined {
    const match = text.match(/please retry in (\d+)\s*s/i);
    if (!match?.[1]) {
        return undefined;
    }
    const seconds = parseInt(match[1], 10);
    return Number.isFinite(seconds) ? seconds : undefined;
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
