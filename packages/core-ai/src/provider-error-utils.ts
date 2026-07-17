/**
 * Shared helpers for provider error wrappers.
 * Providers decide which error subclass to throw; these utilities only
 * extract common SDK shapes and status/message cues.
 */

const TRANSIENT_UNAVAILABLE_STATUS_CODES = new Set([500, 502, 503, 504]);

/**
 * Status codes where free-text capacity cues are allowed to classify as
 * model overload. Message matching is intentionally not applied to ordinary
 * 4xx responses (including 429) to avoid false positives.
 */
const OVERLOAD_MESSAGE_ELIGIBLE_STATUS_CODES = new Set([
    500, 502, 503, 504, 529,
]);

export function isRateLimitStatus(statusCode: number | undefined): boolean {
    return statusCode === 429;
}

export function isOverloadedStatus(statusCode: number | undefined): boolean {
    return statusCode === 529;
}

export function isTransientUnavailableStatus(
    statusCode: number | undefined
): boolean {
    return (
        statusCode !== undefined &&
        TRANSIENT_UNAVAILABLE_STATUS_CODES.has(statusCode)
    );
}

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

    const record = asRecord(error);
    const message = getString(record, 'message');
    if (message) {
        return message;
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

/** Reads `Retry-After` from common SDK error shapes that expose `headers`. */
export function getRetryAfterSecondsFromError(
    error: unknown
): number | undefined {
    const record = asRecord(error);
    if (!record?.headers || typeof record.headers !== 'object') {
        return undefined;
    }

    return parseRetryAfterSeconds(
        record.headers as Headers | Record<string, string>
    );
}
