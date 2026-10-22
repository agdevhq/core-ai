/**
 * Shared helpers for provider error wrappers.
 * Providers decide which error subclass to throw; these utilities only
 * extract common SDK shapes and thin HTTP status conventions.
 * Provider-specific message heuristics stay in each wrap*Error.
 */

const TRANSIENT_UNAVAILABLE_STATUS_CODES = new Set([500, 502, 503, 504]);

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
 * Socket-level and Node fetch (undici) failure codes: the connection dropped
 * or timed out before or while the provider answered, so the provider never
 * rejected the request itself.
 */
const TRANSPORT_ERROR_CODES = new Set([
    'UND_ERR_SOCKET',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE',
]);

/**
 * Whether `error`, or anything in its `cause` chain (including
 * `AggregateError.errors`), carries a transport failure code. Node fetch
 * reports these as `TypeError: fetch failed` with the code on a nested cause.
 */
export function isTransportError(error: unknown): boolean {
    const pending: unknown[] = [error];
    const seen = new Set<unknown>();

    while (pending.length > 0) {
        const current = pending.pop();
        const record = asRecord(current);
        if (!record || seen.has(current)) {
            continue;
        }
        seen.add(current);

        const code = getString(record, 'code');
        if (code !== undefined && TRANSPORT_ERROR_CODES.has(code)) {
            return true;
        }

        pending.push(record.cause);
        if (current instanceof AggregateError) {
            pending.push(...current.errors);
        }
    }

    return false;
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
