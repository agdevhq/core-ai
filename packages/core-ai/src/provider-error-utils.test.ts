import { describe, expect, it } from 'vitest';
import {
    getErrorMessage,
    getHttpStatusCode,
    getRetryAfterSecondsFromError,
    indicatesModelOverload,
    isOverloadedStatus,
    isRateLimitStatus,
    isTransientUnavailableStatus,
    parseRetryAfterSeconds,
} from './provider-error-utils.ts';

describe('status helpers', () => {
    it('recognizes rate-limit, overload, and transient unavailable statuses', () => {
        expect(isRateLimitStatus(429)).toBe(true);
        expect(isRateLimitStatus(503)).toBe(false);
        expect(isOverloadedStatus(529)).toBe(true);
        expect(isOverloadedStatus(503)).toBe(false);
        expect(isTransientUnavailableStatus(500)).toBe(true);
        expect(isTransientUnavailableStatus(503)).toBe(true);
        expect(isTransientUnavailableStatus(429)).toBe(false);
    });
});

describe('indicatesModelOverload', () => {
    it('detects capacity phrases on eligible statuses', () => {
        expect(indicatesModelOverload('The model is overloaded', 503)).toBe(
            true
        );
        expect(indicatesModelOverload('high demand right now', 503)).toBe(true);
        expect(indicatesModelOverload('not related', 503)).toBe(false);
    });

    it('ignores capacity phrases on ordinary client/rate-limit statuses', () => {
        expect(indicatesModelOverload('The model is overloaded', 400)).toBe(
            false
        );
        expect(indicatesModelOverload('The model is overloaded', 429)).toBe(
            false
        );
    });

    it('allows capacity phrases when status is unknown', () => {
        expect(indicatesModelOverload('The model is overloaded')).toBe(true);
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
        expect(parseRetryAfterSeconds({ 'retry-after': 'Fri, 01 Jan' })).toBe(
            undefined
        );
    });

    it('getRetryAfterSecondsFromError reads headers from error objects', () => {
        expect(
            getRetryAfterSecondsFromError({
                headers: new Headers({ 'retry-after': '9' }),
            })
        ).toBe(9);
        expect(getRetryAfterSecondsFromError(new Error('x'))).toBeUndefined();
    });
});
