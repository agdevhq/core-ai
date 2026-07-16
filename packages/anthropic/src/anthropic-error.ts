import { APIError, APIUserAbortError } from '@anthropic-ai/sdk';
import {
    AbortedError,
    ContextLengthExceededError,
    ModelOverloadedError,
    ProviderError,
    RateLimitError,
    ServiceUnavailableError,
} from '@core-ai/core-ai';

/**
 * Maps Anthropic / Anthropic Vertex SDK errors to classified core-ai provider errors.
 *
 * Classification precedence:
 * 1. Abort
 * 2. Context length (prompt-too-long message)
 * 3. HTTP 529 → model overloaded
 * 4. Rate limit (`rate_limit_error`, HTTP 429, Vertex `RESOURCE_EXHAUSTED`)
 * 5. HTTP 503 → service unavailable
 * 6. Otherwise → ProviderError with code `unknown`
 */
export function wrapError(
    error: unknown,
    provider = 'anthropic'
): AbortedError | ProviderError {
    if (
        error instanceof APIUserAbortError ||
        (error instanceof Error && error.name === 'AbortError')
    ) {
        return new AbortedError(error, provider);
    }

    const message = getErrorMessage(error);
    const statusCode = getStatusCode(error);

    const contextLengthError = tryContextLengthExceededError(
        error,
        message,
        provider,
        statusCode
    );
    if (contextLengthError) {
        return contextLengthError;
    }

    if (statusCode === 529) {
        return new ModelOverloadedError(message, provider, {
            statusCode,
            cause: error,
        });
    }

    if (isRateLimitError(error, statusCode)) {
        return new RateLimitError(message, provider, {
            statusCode: statusCode ?? 429,
            cause: error,
            retryAfterSeconds: getRetryAfterSeconds(error),
        });
    }

    if (statusCode === 503) {
        return new ServiceUnavailableError(message, provider, {
            statusCode,
            cause: error,
        });
    }

    return new ProviderError(message, provider, {
        statusCode,
        cause: error,
    });
}

function tryContextLengthExceededError(
    error: unknown,
    message: string,
    provider: string,
    statusCode: number | undefined
): ContextLengthExceededError | undefined {
    const providerMessage = getAnthropicErrorMessage(error);
    if (!providerMessage?.includes('prompt is too long')) {
        return undefined;
    }

    const match = providerMessage.match(
        /prompt is too long: (\d+) tokens > (\d+) maximum/
    );
    if (!match) {
        return new ContextLengthExceededError(message, provider, {
            statusCode,
            cause: error,
        });
    }

    const actualTokens = match[1];
    const maxTokens = match[2];
    if (actualTokens === undefined || maxTokens === undefined) {
        return new ContextLengthExceededError(message, provider, {
            statusCode,
            cause: error,
        });
    }

    return new ContextLengthExceededError(message, provider, {
        statusCode,
        cause: error,
        maxTokens: parseInt(maxTokens, 10),
        actualTokens: parseInt(actualTokens, 10),
    });
}

function isRateLimitError(
    error: unknown,
    statusCode: number | undefined
): boolean {
    if (statusCode === 429) {
        return true;
    }

    const type = getAnthropicErrorType(error);
    if (type === 'rate_limit_error') {
        return true;
    }

    return isResourceExhaustedError(error);
}

/**
 * Vertex Anthropic may nest a Google API error body with
 * `RESOURCE_EXHAUSTED` / HTTP 429.
 */
function isResourceExhaustedError(error: unknown): boolean {
    const body = getNestedGoogleApiErrorBody(error);
    if (!body) {
        return false;
    }

    const code =
        typeof body.code === 'number' ? body.code : Number(body.code);
    return (
        code === 429 || body.status?.toUpperCase() === 'RESOURCE_EXHAUSTED'
    );
}

function getNestedGoogleApiErrorBody(
    error: unknown
): { code?: number | string; status?: string } | undefined {
    const record = asRecord(error);
    const outer = asRecord(record?.error);
    const inner = asRecord(outer?.error);
    if (inner && ('code' in inner || 'status' in inner)) {
        return inner as { code?: number | string; status?: string };
    }
    return undefined;
}

function getAnthropicErrorMessage(error: unknown): string | undefined {
    if (error instanceof APIError) {
        const nested = asRecord(error.error);
        return getString(nested, 'message') ?? error.message;
    }

    const record = asRecord(error);
    const outer = asRecord(record?.error);
    const inner = asRecord(outer?.error);
    return (
        getString(inner, 'message') ??
        getString(outer, 'message') ??
        getString(record, 'message')
    );
}

function getAnthropicErrorType(error: unknown): string | undefined {
    if (error instanceof APIError) {
        if (typeof error.error === 'object' && error.error) {
            return getString(asRecord(error.error), 'type');
        }
    }

    const record = asRecord(error);
    const outer = asRecord(record?.error);
    const inner = asRecord(outer?.error);
    return getString(inner, 'type') ?? getString(outer, 'type');
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function getStatusCode(error: unknown): number | undefined {
    if (error instanceof APIError) {
        return error.status;
    }
    if (
        error instanceof Object &&
        'status' in error &&
        typeof (error as { status: unknown }).status === 'number'
    ) {
        const status = (error as { status: number }).status;
        return Number.isFinite(status) ? status : undefined;
    }
    return undefined;
}

function getRetryAfterSeconds(error: unknown): number | undefined {
    if (!(error instanceof APIError) || !error.headers) {
        return undefined;
    }

    const retryAfter = error.headers.get('retry-after');
    if (!retryAfter) {
        return undefined;
    }

    const parsed = parseInt(retryAfter, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    if (value && typeof value === 'object') {
        return value as Record<string, unknown>;
    }
    return undefined;
}

function getString(
    source: Record<string, unknown> | undefined,
    key: string
): string | undefined {
    if (!source) {
        return undefined;
    }
    const value = source[key];
    return typeof value === 'string' ? value : undefined;
}
