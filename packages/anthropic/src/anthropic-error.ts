import { APIError, APIUserAbortError } from '@anthropic-ai/sdk';
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

/**
 * Maps Anthropic / Anthropic Vertex SDK errors to classified core-ai provider
 * errors via the shared precedence in `classifyProviderError`.
 */
export function wrapAnthropicError(
    error: unknown,
    provider = 'anthropic'
): AbortedError | ProviderError {
    const message = getErrorMessage(error);
    const statusCode =
        error instanceof APIError
            ? error.status
            : getHttpStatusCode(error, ['status']);
    const providerMessage = getAnthropicErrorMessage(error);
    const errorType = getAnthropicErrorType(error);

    return classifyProviderError({
        message,
        provider,
        cause: error,
        statusCode,
        aborted:
            error instanceof APIUserAbortError || isAbortErrorByName(error),
        contextLength: getContextLengthSignal(providerMessage),
        overloaded:
            statusCode === 529 ||
            errorType === 'overloaded_error' ||
            indicatesModelOverload(
                `${providerMessage ?? ''} ${message}`,
                statusCode
            ),
        rateLimit: isRateLimitSignal(error, statusCode, errorType),
        retryAfterSeconds: getRetryAfterSeconds(error),
        serviceUnavailable:
            statusCode === 503 || isUnavailableStatus(error),
    });
}

function getContextLengthSignal(
    providerMessage: string | undefined
): true | ContextLengthSignal | undefined {
    if (!providerMessage?.includes('prompt is too long')) {
        return undefined;
    }

    const match = providerMessage.match(
        /prompt is too long: (\d+) tokens > (\d+) maximum/
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

function isRateLimitSignal(
    error: unknown,
    statusCode: number | undefined,
    errorType: string | undefined
): boolean {
    if (statusCode === 429 || errorType === 'rate_limit_error') {
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

function isUnavailableStatus(error: unknown): boolean {
    const body = getNestedGoogleApiErrorBody(error);
    return body?.status?.toUpperCase() === 'UNAVAILABLE';
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

function getRetryAfterSeconds(error: unknown): number | undefined {
    if (!(error instanceof APIError) || !error.headers) {
        return undefined;
    }
    return parseRetryAfterSeconds(error.headers);
}
