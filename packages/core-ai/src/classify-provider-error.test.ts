import { describe, expect, it } from 'vitest';
import {
    classifyProviderError,
    getErrorMessage,
    getHttpStatusCode,
    indicatesModelOverload,
    parseRetryAfterSeconds,
} from './classify-provider-error.ts';
import {
    AbortedError,
    ContextLengthExceededError,
    ModelOverloadedError,
    ProviderError,
    RateLimitError,
    ServiceUnavailableError,
} from './errors.ts';

describe('classifyProviderError', () => {
    it('maps abort before any other signal', () => {
        const error = classifyProviderError({
            message: 'ignored',
            provider: 'openai',
            aborted: true,
            contextLength: true,
            rateLimit: true,
            cause: new Error('aborted'),
        });

        expect(error).toBeInstanceOf(AbortedError);
        expect(error.provider).toBe('openai');
    });

    it('prefers context length over overload, rate limit, and unavailable', () => {
        const error = classifyProviderError({
            message: 'too long',
            provider: 'openai',
            statusCode: 429,
            contextLength: { maxTokens: 8, actualTokens: 10 },
            overloaded: true,
            rateLimit: true,
            serviceUnavailable: true,
        });

        expect(error).toBeInstanceOf(ContextLengthExceededError);
        expect((error as ContextLengthExceededError).maxTokens).toBe(8);
        expect((error as ContextLengthExceededError).actualTokens).toBe(10);
    });

    it('prefers overload over rate limit and unavailable', () => {
        const error = classifyProviderError({
            message: 'busy',
            provider: 'google',
            statusCode: 429,
            overloaded: true,
            rateLimit: true,
            serviceUnavailable: true,
        });

        expect(error).toBeInstanceOf(ModelOverloadedError);
        expect((error as ModelOverloadedError).code).toBe('model_overloaded');
    });

    it('prefers explicit rate limit over unavailable', () => {
        const error = classifyProviderError({
            message: 'slow down',
            provider: 'openai',
            statusCode: 503,
            rateLimit: true,
            serviceUnavailable: true,
            retryAfterSeconds: 15,
        });

        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).retryAfterSeconds).toBe(15);
    });

    it('allows explicit service unavailable to win over status 429 fallback', () => {
        const error = classifyProviderError({
            message: 'Backend error.',
            provider: 'azure-openai',
            statusCode: 429,
            serviceUnavailable: true,
        });

        expect(error).toBeInstanceOf(ServiceUnavailableError);
        expect((error as ServiceUnavailableError).statusCode).toBe(429);
    });

    it('uses status fallbacks in the same precedence order', () => {
        expect(
            classifyProviderError({
                message: 'overloaded',
                provider: 'anthropic',
                statusCode: 529,
            })
        ).toBeInstanceOf(ModelOverloadedError);

        expect(
            classifyProviderError({
                message: 'rate limited',
                provider: 'openai',
                statusCode: 429,
            })
        ).toBeInstanceOf(RateLimitError);

        for (const statusCode of [500, 502, 503, 504]) {
            const error = classifyProviderError({
                message: 'down',
                provider: 'mistral',
                statusCode,
            });
            expect(error).toBeInstanceOf(ServiceUnavailableError);
            expect((error as ServiceUnavailableError).isRetryable).toBe(true);
        }
    });

    it('returns unknown ProviderError when nothing matches', () => {
        const error = classifyProviderError({
            message: 'nope',
            provider: 'openai',
            statusCode: 400,
        });

        expect(error).toBeInstanceOf(ProviderError);
        expect(error).not.toBeInstanceOf(RateLimitError);
        const providerError = error as ProviderError;
        expect(providerError.code).toBe('unknown');
        expect(providerError.isRetryable).toBe(false);
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
    it('getErrorMessage reads Error.message or stringifies', () => {
        expect(getErrorMessage(new Error('x'))).toBe('x');
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
});
