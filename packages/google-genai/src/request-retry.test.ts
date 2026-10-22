import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AbortedError,
    ContextLengthExceededError,
    ProviderError,
    ProviderQuotaExceededError,
    RateLimitError,
    ServiceUnavailableError,
} from '@core-ai/core-ai';
import { withRequestRetry } from './request-retry.ts';

const PROVIDER = 'google';

function retryOptions(
    overrides: Partial<Parameters<typeof withRequestRetry>[1]> = {}
): Parameters<typeof withRequestRetry>[1] {
    return {
        maxRetries: 2,
        provider: PROVIDER,
        wrapError: (error) =>
            error instanceof ProviderError || error instanceof AbortedError
                ? error
                : new ProviderError(String(error), PROVIDER),
        ...overrides,
    };
}

function unavailable(): ServiceUnavailableError {
    return new ServiceUnavailableError('unavailable', PROVIDER);
}

describe('withRequestRetry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('returns the result without retrying when the call succeeds', async () => {
        const call = vi.fn(async () => 'ok');

        await expect(withRequestRetry(call, retryOptions())).resolves.toBe(
            'ok'
        );
        expect(call).toHaveBeenCalledTimes(1);
    });

    it('retries transient failures with exponential backoff until the call succeeds', async () => {
        // Midpoint of the jitter range: delays are exactly 1 s, then 2 s.
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const call = vi
            .fn<() => Promise<string>>()
            .mockRejectedValueOnce(unavailable())
            .mockRejectedValueOnce(unavailable())
            .mockResolvedValueOnce('ok');

        const result = withRequestRetry(call, retryOptions());

        await vi.advanceTimersByTimeAsync(999);
        expect(call).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(call).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1999);
        expect(call).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1);
        await expect(result).resolves.toBe('ok');
        expect(call).toHaveBeenCalledTimes(3);
    });

    it('throws the last typed error once retries are exhausted', async () => {
        const last = new RateLimitError('still limited', PROVIDER);
        const call = vi
            .fn<() => Promise<string>>()
            .mockRejectedValueOnce(unavailable())
            .mockRejectedValueOnce(unavailable())
            .mockRejectedValueOnce(last);

        const result = withRequestRetry(call, retryOptions());
        const rejection = expect(result).rejects.toBe(last);
        await vi.runAllTimersAsync();

        await rejection;
        expect(call).toHaveBeenCalledTimes(3);
    });

    it('waits for the provider-requested Retry-After', async () => {
        const call = vi
            .fn<() => Promise<string>>()
            .mockRejectedValueOnce(
                new RateLimitError('limited', PROVIDER, {
                    retryAfterSeconds: 5,
                })
            )
            .mockResolvedValueOnce('ok');

        const result = withRequestRetry(call, retryOptions());

        await vi.advanceTimersByTimeAsync(4999);
        expect(call).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        await expect(result).resolves.toBe('ok');
    });

    it('fails fast when Retry-After exceeds the cap', async () => {
        const error = new RateLimitError('limited', PROVIDER, {
            retryAfterSeconds: 60,
        });
        const call = vi.fn(async () => {
            throw error;
        });

        await expect(withRequestRetry(call, retryOptions())).rejects.toBe(
            error
        );
        expect(call).toHaveBeenCalledTimes(1);
    });

    it.each([
        [
            'a generic provider error',
            new ProviderError('bad request', PROVIDER),
        ],
        [
            'a quota error',
            new ProviderQuotaExceededError('no credit', PROVIDER),
        ],
        [
            'a context-length error',
            new ContextLengthExceededError('too long', PROVIDER),
        ],
        ['an abort', new AbortedError(undefined, PROVIDER)],
    ])('does not retry %s', async (_label, error) => {
        const call = vi.fn(async () => {
            throw error;
        });

        await expect(withRequestRetry(call, retryOptions())).rejects.toBe(
            error
        );
        expect(call).toHaveBeenCalledTimes(1);
    });

    it('does not retry when maxRetries is 0', async () => {
        const error = unavailable();
        const call = vi.fn(async () => {
            throw error;
        });

        await expect(
            withRequestRetry(call, retryOptions({ maxRetries: 0 }))
        ).rejects.toBe(error);
        expect(call).toHaveBeenCalledTimes(1);
    });

    it('rejects with AbortedError when aborted during the backoff', async () => {
        const controller = new AbortController();
        const call = vi.fn(async () => {
            throw unavailable();
        });

        const result = withRequestRetry(
            call,
            retryOptions({ signal: controller.signal })
        );
        const rejection = expect(result).rejects.toBeInstanceOf(AbortedError);
        await vi.advanceTimersByTimeAsync(100);
        controller.abort();

        await rejection;
        expect(call).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('does not wait when the signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        const call = vi.fn(async () => {
            throw unavailable();
        });

        await expect(
            withRequestRetry(call, retryOptions({ signal: controller.signal }))
        ).rejects.toBeInstanceOf(AbortedError);
        expect(call).toHaveBeenCalledTimes(1);
    });
});
