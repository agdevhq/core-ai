import {
    RequestAbortedError,
    MistralError,
} from '@mistralai/mistralai/models/errors';
import {
    AbortedError,
    ContextLengthExceededError,
    ModelOverloadedError,
    ProviderError,
    RateLimitError,
    ServiceUnavailableError,
    asRecord,
    getErrorMessage,
    getHttpStatusCode,
    getRetryAfterSecondsFromError,
    getString,
    indicatesModelOverload,
    isAbortErrorByName,
    isRateLimitStatus,
    isTransientUnavailableStatus,
} from '@core-ai/core-ai';

type ContextLengthDetails = {
    maxTokens?: number;
    actualTokens?: number;
};

/**
 * Maps Mistral SDK errors to core-ai provider error subclasses.
 * Classification is owned by this wrapper.
 */
export function wrapMistralError(error: unknown): AbortedError | ProviderError {
    if (isMistralAbortError(error)) {
        return new AbortedError(error, 'mistral');
    }

    const message = getErrorMessage(error);
    const statusCode =
        error instanceof MistralError
            ? error.statusCode
            : getHttpStatusCode(error, ['statusCode', 'status']);
    const body = parseErrorBody(error);
    const options = { statusCode, cause: error };

    const contextLength = getContextLengthDetails(body, message);
    if (contextLength) {
        return new ContextLengthExceededError(message, 'mistral', {
            ...options,
            ...contextLength,
        });
    }

    if (indicatesModelOverload(message, statusCode)) {
        return new ModelOverloadedError(message, 'mistral', options);
    }

    if (isMistralRateLimit(statusCode, body?.type)) {
        return new RateLimitError(message, 'mistral', {
            ...options,
            retryAfterSeconds: getRetryAfterSecondsFromError(error),
        });
    }

    if (isTransientUnavailableStatus(statusCode)) {
        return new ServiceUnavailableError(message, 'mistral', options);
    }

    return new ProviderError(message, 'mistral', options);
}

function isMistralAbortError(error: unknown): boolean {
    return (
        error instanceof RequestAbortedError || isAbortErrorByName(error)
    );
}

function isMistralRateLimit(
    statusCode: number | undefined,
    errorType: string | undefined
): boolean {
    return isRateLimitStatus(statusCode) || errorType === 'rate_limit_error';
}

function getContextLengthDetails(
    body: { message?: string; type?: string } | undefined,
    message: string
): ContextLengthDetails | undefined {
    const errorMessage = body?.message ?? message;
    const errorType = body?.type;

    const isContextType =
        errorType === 'invalid_request_error' ||
        errorType === 'invalid_request_invalid_args' ||
        errorType === undefined;

    if (
        !isContextType ||
        !errorMessage.toLowerCase().includes('too large for model')
    ) {
        return undefined;
    }

    const match = errorMessage.match(
        /(\d+)\s*tokens.*too large for model with (\d+) maximum context length/
    );
    if (!match) {
        return {};
    }

    const actualTokens = match[1];
    const maxTokens = match[2];
    if (actualTokens === undefined || maxTokens === undefined) {
        return {};
    }

    return {
        maxTokens: parseInt(maxTokens, 10),
        actualTokens: parseInt(actualTokens, 10),
    };
}

function parseErrorBody(
    error: unknown
): { message?: string; type?: string } | undefined {
    const record = asRecord(error);
    if (!record || !('body' in record)) {
        // Some SDK shapes put type/message on the error itself.
        const type = getString(record, 'type');
        const message = getString(record, 'message');
        if (type || message) {
            return { type, message };
        }
        return undefined;
    }

    const body = record.body;
    if (typeof body !== 'string') {
        if (body && typeof body === 'object') {
            const bodyRecord = asRecord(body);
            return {
                message: getString(bodyRecord, 'message'),
                type: getString(bodyRecord, 'type'),
            };
        }
        return undefined;
    }

    try {
        const parsed: unknown = JSON.parse(body);
        const parsedRecord = asRecord(parsed);
        if (parsedRecord) {
            return {
                message: getString(parsedRecord, 'message'),
                type: getString(parsedRecord, 'type'),
            };
        }
    } catch {
        // ignore
    }
    return undefined;
}
