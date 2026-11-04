/**
 * Shared helpers for provider error wrappers.
 * Providers decide which error subclass to throw; these utilities only
 * extract common SDK shapes and thin HTTP status conventions.
 * Provider-specific message heuristics stay in each wrap*Error.
 */

const TRANSIENT_UNAVAILABLE_STATUS_CODES = new Set([500, 502, 503, 504]);

/**
 * Node.js system and undici error codes for a connection that failed or broke
 * off. `fetch` reports these as `TypeError: fetch failed` (request) or
 * `TypeError: terminated` (body) with the coded error in `cause`.
 */
const TRANSIENT_NETWORK_ERROR_CODES = new Set([
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE',
    'EAI_AGAIN',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'UND_ERR_SOCKET',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
]);

/** Bounds the `cause` walk so a cyclic or very deep chain cannot loop. */
const MAX_CAUSE_DEPTH = 5;

export function isRateLimitStatus(statusCode: number | undefined): boolean {
    return statusCode === 429;
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
 * True when the error, or an error in its `cause` chain, carries a network
 * error code: the connection to the provider failed or dropped mid-response.
 * Covers raw `fetch` failures and SDK connection errors that wrap them.
 */
export function isTransientNetworkError(error: unknown): boolean {
    let current: unknown = error;
    for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth++) {
        const record = asRecord(current);
        if (!record) {
            return false;
        }
        const code = getString(record, 'code');
        if (code !== undefined && TRANSIENT_NETWORK_ERROR_CODES.has(code)) {
            return true;
        }
        current = record.cause;
    }
    return false;
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

export function asRecord(value: unknown): Record<string, unknown> | undefined {
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
 * Parses retry delay from a `Headers` instance or plain header map.
 * Prefers Azure `retry-after-ms` (ceil ms → seconds), then `Retry-After`
 * as integer seconds or HTTP-date.
 */
export function parseRetryAfterSeconds(
    headers: Headers | Record<string, string> | undefined
): number | undefined {
    if (!headers) {
        return undefined;
    }

    const retryAfterMs = getHeaderValue(headers, 'retry-after-ms');
    if (retryAfterMs !== undefined) {
        const ms = Number(retryAfterMs);
        if (Number.isFinite(ms) && ms >= 0) {
            return Math.ceil(ms / 1000);
        }
    }

    const retryAfter = getHeaderValue(headers, 'retry-after');
    if (retryAfter === undefined) {
        return undefined;
    }

    const asSeconds = Number(retryAfter);
    if (Number.isFinite(asSeconds) && /^\d+$/.test(retryAfter.trim())) {
        return asSeconds;
    }

    const when = Date.parse(retryAfter);
    if (!Number.isFinite(when)) {
        return undefined;
    }

    const seconds = Math.ceil((when - Date.now()) / 1000);
    return seconds >= 0 ? seconds : undefined;
}

function getHeaderValue(
    headers: Headers | Record<string, string>,
    name: string
): string | undefined {
    if (typeof (headers as Headers).get === 'function') {
        return (headers as Headers).get(name) ?? undefined;
    }

    const record = headers as Record<string, string>;
    const direct = record[name];
    if (typeof direct === 'string') {
        return direct;
    }

    const lower = name.toLowerCase();
    for (const [key, value] of Object.entries(record)) {
        if (key.toLowerCase() === lower && typeof value === 'string') {
            return value;
        }
    }
    return undefined;
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
