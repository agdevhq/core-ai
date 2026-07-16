import { ApiError } from '@google/genai';
import {
    AbortedError,
    ContextLengthExceededError,
    ModelOverloadedError,
    ProviderError,
    RateLimitError,
    ServiceUnavailableError,
} from '@core-ai/core-ai';

type GoogleApiErrorBody = {
    code?: number | string;
    message?: string;
    status?: string;
};

/**
 * Maps Google GenAI / Vertex SDK errors to classified core-ai provider errors.
 *
 * Classification precedence:
 * 1. Abort
 * 2. Context length (input token count message)
 * 3. Rate limit (HTTP 429 / RESOURCE_EXHAUSTED)
 * 4. Model overloaded (capacity / high-demand message cues)
 * 5. Service unavailable (HTTP 503 / UNAVAILABLE)
 * 6. Otherwise → ProviderError with code `unknown`
 */
export function wrapGoogleError(
    error: unknown,
    provider = 'google'
): AbortedError | ProviderError {
    if (isAbortError(error)) {
        return new AbortedError(error, provider);
    }

    const message = getErrorMessage(error);
    const statusCode = getStatusCode(error);
    const body = tryParseGoogleApiErrorBody(message);
    const effectiveHttp = statusCode ?? toNumericHttpCode(body);
    const status = normalizedStatus(body);

    const contextLengthError = tryContextLengthExceededError(
        message,
        provider,
        effectiveHttp,
        error
    );
    if (contextLengthError) {
        return contextLengthError;
    }

    if (effectiveHttp === 429 || status === 'RESOURCE_EXHAUSTED') {
        return new RateLimitError(message, provider, {
            statusCode: effectiveHttp ?? 429,
            cause: error,
        });
    }

    const combinedForOverload = `${body?.message?.toLowerCase() ?? ''} ${message.toLowerCase()}`;
    if (indicatesCapacityOverload(combinedForOverload)) {
        return new ModelOverloadedError(message, provider, {
            statusCode: effectiveHttp,
            cause: error,
        });
    }

    if (
        effectiveHttp === 503 ||
        status === 'UNAVAILABLE' ||
        rawJsonMentionsUnavailableStatus(message)
    ) {
        return new ServiceUnavailableError(message, provider, {
            statusCode: effectiveHttp ?? 503,
            cause: error,
        });
    }

    return new ProviderError(message, provider, {
        statusCode: effectiveHttp,
        cause: error,
    });
}

function tryContextLengthExceededError(
    message: string,
    provider: string,
    statusCode: number | undefined,
    cause: unknown
): ContextLengthExceededError | undefined {
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

    return new ContextLengthExceededError(message, provider, {
        statusCode,
        cause,
        maxTokens: parseInt(maxTokens, 10),
        actualTokens: parseInt(actualTokens, 10),
    });
}

function indicatesCapacityOverload(lowerCombinedText: string): boolean {
    return (
        lowerCombinedText.includes('high demand') ||
        lowerCombinedText.includes('overloaded') ||
        lowerCombinedText.includes('running out of capacity') ||
        lowerCombinedText.includes('spikes in demand')
    );
}

function rawJsonMentionsUnavailableStatus(raw: string): boolean {
    const lower = raw.toLowerCase();
    return (
        lower.includes('"status":"unavailable"') ||
        lower.includes('"status": "unavailable"')
    );
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

function normalizedStatus(body: GoogleApiErrorBody | null): string | undefined {
    return body?.status?.toUpperCase();
}

function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function getStatusCode(error: unknown): number | undefined {
    if (error instanceof ApiError) {
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
