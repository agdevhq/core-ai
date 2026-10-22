import {
    AbortedError,
    RateLimitError,
    RetryableProviderError,
    type ProviderError,
} from '@core-ai/core-ai';

/** Same default as the OpenAI and Anthropic SDKs core-ai wraps. */
export const DEFAULT_MAX_RETRIES = 2;

const BASE_RETRY_DELAY_MS = 1000;
const RETRY_DELAY_JITTER = 0.2;

/**
 * Longest provider-requested `Retry-After` worth waiting for; a longer one
 * fails fast so the caller decides instead of hanging the request.
 */
const MAX_RETRY_AFTER_SECONDS = 20;

export type RequestRetryOptions = {
    maxRetries: number;
    provider: string;
    signal?: AbortSignal;
    wrapError: (error: unknown) => AbortedError | ProviderError;
};

/**
 * Runs a provider request and retries transient failures
 * ({@link RetryableProviderError}) with exponential backoff.
 *
 * Only wrap calls that settle once the provider's response starts (the SDK
 * resolves `generateContentStream` on the response headers): a rejection then
 * means no response content exists yet, so a retry cannot duplicate output.
 * Errors raised while consuming a stream are never retried here.
 */
export async function withRequestRetry<T>(
    call: () => Promise<T>,
    options: RequestRetryOptions
): Promise<T> {
    for (let retry = 0; ; retry++) {
        try {
            return await call();
        } catch (error) {
            const wrapped = options.wrapError(error);
            const delayMs = getRetryDelayMs(wrapped, retry, options.maxRetries);
            if (delayMs === undefined) {
                throw wrapped;
            }
            await waitForRetry(delayMs, options.signal, options.provider);
        }
    }
}

function getRetryDelayMs(
    error: AbortedError | ProviderError,
    retry: number,
    maxRetries: number
): number | undefined {
    if (retry >= maxRetries || !(error instanceof RetryableProviderError)) {
        return undefined;
    }

    if (
        error instanceof RateLimitError &&
        error.retryAfterSeconds !== undefined
    ) {
        return error.retryAfterSeconds <= MAX_RETRY_AFTER_SECONDS
            ? error.retryAfterSeconds * 1000
            : undefined;
    }

    const jitter = 1 + (Math.random() * 2 - 1) * RETRY_DELAY_JITTER;
    return Math.round(BASE_RETRY_DELAY_MS * 2 ** retry * jitter);
}

function waitForRetry(
    delayMs: number,
    signal: AbortSignal | undefined,
    provider: string
): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new AbortedError(signal.reason, provider));
            return;
        }

        const onAbort = () => {
            clearTimeout(timer);
            reject(new AbortedError(signal?.reason, provider));
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, delayMs);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
