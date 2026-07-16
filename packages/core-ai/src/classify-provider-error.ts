import {
    AbortedError,
    ContextLengthExceededError,
    ModelOverloadedError,
    ProviderError,
    RateLimitError,
    ServiceUnavailableError,
} from './errors.ts';

/**
 * Optional token counts when a provider message includes them.
 * Omit both when the failure is context-related but counts are unknown
 * (or when the failure is a string-length limit, not a token limit).
 */
export type ContextLengthSignal = {
    maxTokens?: number;
    actualTokens?: number;
};

/**
 * Provider wrappers extract SDK-specific signals; this input is classified
 * with one shared precedence for every provider:
 *
 * 1. abort
 * 2. context length
 * 3. model overloaded (explicit flag)
 * 4. rate limit (explicit flag)
 * 5. service unavailable (explicit flag)
 * 6. HTTP status fallbacks (same order: 529 → overload, 429 → rate limit,
 *    500/502/503/504 → unavailable)
 * 7. unknown
 *
 * Explicit flags always beat status fallbacks so provider-specific quirks
 * (e.g. Azure capacity returning HTTP 429) can opt into a higher-priority
 * class without fighting the status code.
 */
export type ProviderErrorClassificationInput = {
    message: string;
    provider: string;
    cause?: unknown;
    statusCode?: number;
    aborted?: boolean;
    /** `true` when counts are unknown; object when parseable. */
    contextLength?: true | ContextLengthSignal;
    overloaded?: boolean;
    rateLimit?: boolean;
    retryAfterSeconds?: number;
    serviceUnavailable?: boolean;
};

const TRANSIENT_UNAVAILABLE_STATUS_CODES = new Set([500, 502, 503, 504]);

export function classifyProviderError(
    input: ProviderErrorClassificationInput
): AbortedError | ProviderError {
    const { message, provider, cause, statusCode } = input;

    if (input.aborted) {
        return new AbortedError(cause, provider);
    }

    if (input.contextLength) {
        const tokens =
            input.contextLength === true ? {} : input.contextLength;
        return new ContextLengthExceededError(message, provider, {
            statusCode,
            cause,
            maxTokens: tokens.maxTokens,
            actualTokens: tokens.actualTokens,
        });
    }

    if (input.overloaded) {
        return new ModelOverloadedError(message, provider, {
            statusCode,
            cause,
        });
    }

    if (input.rateLimit) {
        return new RateLimitError(message, provider, {
            statusCode: statusCode ?? 429,
            cause,
            retryAfterSeconds: input.retryAfterSeconds,
        });
    }

    if (input.serviceUnavailable) {
        return new ServiceUnavailableError(message, provider, {
            statusCode,
            cause,
        });
    }

    if (statusCode === 529) {
        return new ModelOverloadedError(message, provider, {
            statusCode,
            cause,
        });
    }

    if (statusCode === 429) {
        return new RateLimitError(message, provider, {
            statusCode,
            cause,
            retryAfterSeconds: input.retryAfterSeconds,
        });
    }

    if (
        statusCode !== undefined &&
        TRANSIENT_UNAVAILABLE_STATUS_CODES.has(statusCode)
    ) {
        return new ServiceUnavailableError(message, provider, {
            statusCode,
            cause,
        });
    }

    return new ProviderError(message, provider, {
        statusCode,
        cause,
    });
}

/**
 * Status codes where free-text capacity cues are allowed to classify as
 * model overload. Message matching is intentionally not applied to ordinary
 * 4xx responses (including 429) to avoid false positives.
 */
const OVERLOAD_MESSAGE_ELIGIBLE_STATUS_CODES = new Set([
    500, 502, 503, 504, 529,
]);

/**
 * Message-fallback detector for capacity / high-demand overload.
 *
 * Prefer structured signals (HTTP 529, provider error types) first. When using
 * this helper, pass `statusCode` so cues are only honored on capacity-like
 * responses. If `statusCode` is omitted (unknown / non-HTTP shapes), cues are
 * still considered.
 */
export function indicatesModelOverload(
    text: string,
    statusCode?: number
): boolean {
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

export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

export function asRecord(
    value: unknown
): Record<string, unknown> | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return undefined;
}

export function getString(
    source: Record<string, unknown> | undefined,
    key: string
): string | undefined {
    if (!source) {
        return undefined;
    }
    const value = source[key];
    return typeof value === 'string' ? value : undefined;
}

/**
 * Reads a finite numeric HTTP status from common SDK error shapes
 * (`status` and/or `statusCode`).
 */
export function getHttpStatusCode(
    error: unknown,
    keys: readonly ('status' | 'statusCode')[] = ['status', 'statusCode']
): number | undefined {
    const record = asRecord(error);
    if (!record) {
        return undefined;
    }

    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
    }
    return undefined;
}

export function isAbortErrorByName(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

/**
 * Parses `Retry-After` as integer seconds from a `Headers` instance or a
 * plain header map. Non-numeric / HTTP-date values are ignored.
 */
export function parseRetryAfterSeconds(
    headers: Headers | Record<string, string> | undefined
): number | undefined {
    if (!headers) {
        return undefined;
    }

    let retryAfter: string | undefined;
    if (typeof (headers as Headers).get === 'function') {
        retryAfter = (headers as Headers).get('retry-after') ?? undefined;
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
