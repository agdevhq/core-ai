import { describe, expect, it } from 'vitest';
import {
    getErrorMessage,
    getHttpStatusCode,
    getRetryAfterSecondsFromError,
    isRateLimitStatus,
    isTransientUnavailableStatus,
    parseRetryAfterSeconds,
} from './provider-error-utils.ts';

describe('status helpers', () => {
    it('recognizes rate-limit and transient unavailable statuses', () => {
        expect(isRateLimitStatus(429)).toBe(true);
        expect(isRateLimitStatus(503)).toBe(false);
        expect(isTransientUnavailableStatus(500)).toBe(true);
        expect(isTransientUnavailableStatus(503)).toBe(true);
        expect(isTransientUnavailableStatus(429)).toBe(false);
    });
});

describe('error helper utilities', () => {
    it('getErrorMessage reads Error.message, plain object message, or stringifies', () => {
        expect(getErrorMessage(new Error('x'))).toBe('x');
        expect(getErrorMessage({ message: 'from object' })).toBe('from object');
        expect(getErrorMessage(42)).toBe('42');
    });

    it('getHttpStatusCode reads status or statusCode', () => {
        expect(getHttpStatusCode({ status: 429 })).toBe(429);
        expect(getHttpStatusCode({ statusCode: 503 }, ['statusCode'])).toBe(
            503
        );
        expect(getHttpStatusCode({ status: 'nope' })).toBeUndefined();
    });

    it('parseRetryAfterSeconds supports Headers and plain maps', () => {
        expect(
            parseRetryAfterSeconds(new Headers({ 'retry-after': '30' }))
        ).toBe(30);
        expect(parseRetryAfterSeconds({ 'retry-after': '12' })).toBe(12);
        expect(parseRetryAfterSeconds({ 'retry-after': 'not-a-date' })).toBe(
            undefined
        );
    });

    it('parseRetryAfterSeconds prefers retry-after-ms over retry-after', () => {
        expect(
            parseRetryAfterSeconds(
                new Headers({
                    'retry-after-ms': '1500',
                    'retry-after': '30',
                })
            )
        ).toBe(2);
        expect(parseRetryAfterSeconds({ 'retry-after-ms': '1500' })).toBe(2);
        expect(parseRetryAfterSeconds({ 'Retry-After-Ms': '999' })).toBe(1);
    });

    it('parseRetryAfterSeconds parses HTTP-date Retry-After values', () => {
        const when = new Date(Date.now() + 45_000).toUTCString();
        const seconds = parseRetryAfterSeconds({ 'retry-after': when });
        expect(seconds).toBeDefined();
        expect(seconds).toBeGreaterThanOrEqual(40);
        expect(seconds).toBeLessThanOrEqual(50);
    });

    it('getRetryAfterSecondsFromError reads headers from error objects', () => {
        expect(
            getRetryAfterSecondsFromError({
                headers: new Headers({ 'retry-after': '9' }),
            })
        ).toBe(9);
        expect(
            getRetryAfterSecondsFromError({
                headers: { 'retry-after-ms': '2500' },
            })
        ).toBe(3);
        expect(getRetryAfterSecondsFromError(new Error('x'))).toBeUndefined();
    });
});
