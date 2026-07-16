import { ApiError } from '@google/genai';
import {
    AbortedError,
    ProviderError,
    classifyProviderError,
    getErrorMessage,
    getHttpStatusCode,
    indicatesModelOverload,
    isAbortErrorByName,
    type ContextLengthSignal,
} from '@core-ai/core-ai';

type GoogleApiErrorBody = {
    code?: number | string;
    message?: string;
    status?: string;
};

/**
 * Maps Google GenAI / Vertex SDK errors to classified core-ai provider errors
 * via the shared precedence in `classifyProviderError`.
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
    const status = body?.status?.toUpperCase();
    const combinedText = `${body?.message ?? ''} ${message}`;

    return classifyProviderError({
        message,
        provider,
        cause: error,
        statusCode: effectiveHttp,
        aborted: isAbortErrorByName(error),
        contextLength: getContextLengthSignal(message),
        overloaded: indicatesModelOverload(combinedText, effectiveHttp),
        rateLimit:
            effectiveHttp === 429 || status === 'RESOURCE_EXHAUSTED',
        serviceUnavailable:
            effectiveHttp === 503 || status === 'UNAVAILABLE',
    });
}

function getContextLengthSignal(
    message: string
): ContextLengthSignal | undefined {
    const match = message.match(
        /input token count \((\d+)\) exceeds the maximum number of tokens allowed \((\d+)\)/i
    );
    if (!match) {
        return undefined;
    }

    const actualTokens = match[1];
    const maxTokens = match[2];
    if (actualTokens === undefined || maxTokens === undefined) {
        return undefined;
    }

    return {
        maxTokens: parseInt(maxTokens, 10),
        actualTokens: parseInt(actualTokens, 10),
    };
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
