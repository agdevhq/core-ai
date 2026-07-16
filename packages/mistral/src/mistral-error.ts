import {
    RequestAbortedError,
    MistralError,
} from '@mistralai/mistralai/models/errors';
import {
    AbortedError,
    ProviderError,
    classifyProviderError,
    getErrorMessage,
    getHttpStatusCode,
    indicatesModelOverload,
    isAbortErrorByName,
    isRateLimitStatus,
    isTransientUnavailableStatus,
    type ContextLengthSignal,
    type ProviderErrorSignals,
} from '@core-ai/core-ai';

/**
 * Maps Mistral SDK errors to classified core-ai provider errors via the
 * shared precedence in `classifyProviderError`.
 */
export function wrapMistralError(error: unknown): AbortedError | ProviderError {
    const message = getErrorMessage(error);
    const statusCode =
        error instanceof MistralError
            ? error.statusCode
            : getHttpStatusCode(error, ['statusCode', 'status']);

    return classifyProviderError(
        {
            message,
            provider: 'mistral',
            cause: error,
            statusCode,
        },
        getMistralErrorSignals(error, message, statusCode)
    );
}

function getMistralErrorSignals(
    error: unknown,
    message: string,
    statusCode: number | undefined
): ProviderErrorSignals {
    return {
        aborted: isMistralAbortError(error),
        contextLength: getContextLengthSignal(error, message),
        overloaded: indicatesModelOverload(message, statusCode),
        rateLimit: isRateLimitStatus(statusCode),
        serviceUnavailable: isTransientUnavailableStatus(statusCode),
    };
}

function isMistralAbortError(error: unknown): boolean {
    return (
        error instanceof RequestAbortedError || isAbortErrorByName(error)
    );
}

function getContextLengthSignal(
    error: unknown,
    message: string
): true | ContextLengthSignal | undefined {
    const body = parseErrorBody(error);
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

function parseErrorBody(
    error: unknown
): { message?: string; type?: string } | undefined {
    if (!(error instanceof Object) || !('body' in error)) {
        return undefined;
    }

    const body = (error as { body: unknown }).body;
    if (typeof body !== 'string') {
        if (body && typeof body === 'object') {
            return body as { message?: string; type?: string };
        }
        return undefined;
    }

    try {
        const parsed: unknown = JSON.parse(body);
        if (parsed && typeof parsed === 'object') {
            return parsed as { message?: string; type?: string };
        }
    } catch {
        // ignore
    }
    return undefined;
}
