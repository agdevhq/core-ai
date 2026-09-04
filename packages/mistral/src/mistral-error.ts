import {
    RequestAbortedError,
    RequestTimeoutError,
    MistralError,
} from '@mistralai/mistralai/models/errors';
import {
    AbortedError,
    ContextLengthExceededError,
    ModelOverloadedError,
    ProviderError,
    ProviderQuotaExceededError,
    RateLimitError,
    ServiceUnavailableError,
    asRecord,
    getErrorMessage,
    getHttpStatusCode,
    getRetryAfterSecondsFromError,
    getString,
    isAbortErrorByName,
    isRateLimitStatus,
    isTransientUnavailableStatus,
} from '@core-ai/core-ai';

/** Only honor capacity wording on 5xx — not ordinary 4xx / 429. */
const OVERLOAD_MESSAGE_ELIGIBLE_STATUS_CODES = new Set([500, 502, 503, 504]);

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

    if (isMistralTimeoutError(error)) {
        return new ServiceUnavailableError(getErrorMessage(error), 'mistral', {
            cause: error,
        });
    }

    const message = getErrorMessage(error);
    const statusCode =
        error instanceof MistralError
            ? error.statusCode
            : getHttpStatusCode(error, ['statusCode', 'status']);
    const body = parseErrorBody(error);
    const options = { statusCode, code: body?.type, cause: error };

    const contextLength = getContextLengthDetails(body, message);
    if (contextLength) {
        return new ContextLengthExceededError(message, 'mistral', {
            ...options,
            ...contextLength,
        });
    }

    if (statusCode === 402) {
        return new ProviderQuotaExceededError(message, 'mistral', options);
    }

    if (indicatesMistralOverload(message, statusCode)) {
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
    return error instanceof RequestAbortedError || isAbortErrorByName(error);
}

function isMistralTimeoutError(error: unknown): boolean {
    return (
        error instanceof RequestTimeoutError ||
        (error instanceof Error && error.name === 'RequestTimeoutError')
    );
}

function isMistralRateLimit(
    statusCode: number | undefined,
    errorType: string | undefined
): boolean {
    return isRateLimitStatus(statusCode) || errorType === 'rate_limit_error';
}

function indicatesMistralOverload(text: string, statusCode?: number): boolean {
    if (
        statusCode !== undefined &&
        !OVERLOAD_MESSAGE_ELIGIBLE_STATUS_CODES.has(statusCode)
    ) {
        return false;
    }

    return /\boverloaded\b/i.test(text);
}

function getContextLengthDetails(
    body: { message?: string; type?: string } | undefined,
    message: string
): ContextLengthDetails | undefined {
    const errorMessage = resolveMistralMessageText(body?.message ?? message);
    const errorType = body?.type;

    const isContextType =
        errorType === 'invalid_request_error' ||
        errorType === 'invalid_request_invalid_args' ||
        errorType === undefined;

    if (!isContextType) {
        return undefined;
    }

    const lower = errorMessage.toLowerCase();
    const isContextWording =
        lower.includes('too large for model') ||
        /exceeds the model's maximum context length/i.test(errorMessage);

    if (!isContextWording) {
        return undefined;
    }

    const match = errorMessage.match(
        /(\d+)\s*tokens.*too large for model with (\d+) maximum context length/
    );
    if (!match) {
        const alternate = errorMessage.match(
            /exceeds the model's maximum context length of (\d+)/i
        );
        if (alternate?.[1]) {
            return { maxTokens: parseInt(alternate[1], 10) };
        }
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

function resolveMistralMessageText(message: string): string {
    const trimmed = message.trim();
    if (!trimmed.startsWith('{')) {
        return message;
    }

    try {
        const parsed: unknown = JSON.parse(trimmed);
        const record = asRecord(parsed);
        const nestedMessage = getString(record, 'message');
        if (nestedMessage) {
            return nestedMessage;
        }
    } catch {
        // keep original
    }
    return message;
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
            return {
                type,
                message: message
                    ? resolveMistralMessageText(message)
                    : undefined,
            };
        }
        return undefined;
    }

    const body = record.body;
    if (typeof body !== 'string') {
        if (body && typeof body === 'object') {
            const bodyRecord = asRecord(body);
            const message = getString(bodyRecord, 'message');
            return {
                message: message
                    ? resolveMistralMessageText(message)
                    : undefined,
                type: getString(bodyRecord, 'type'),
            };
        }
        return undefined;
    }

    try {
        const parsed: unknown = JSON.parse(body);
        const parsedRecord = asRecord(parsed);
        if (parsedRecord) {
            const message = getString(parsedRecord, 'message');
            return {
                message: message
                    ? resolveMistralMessageText(message)
                    : undefined,
                type: getString(parsedRecord, 'type'),
            };
        }
    } catch {
        // ignore
    }
    return undefined;
}
