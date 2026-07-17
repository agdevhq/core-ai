import { ApiError } from '@google/genai';
import { describe, expect, it } from 'vitest';
import {
    AbortedError,
    ContextLengthExceededError,
    ModelOverloadedError,
    ProviderError,
    RateLimitError,
    RetryableProviderError,
    ServiceUnavailableError,
} from '@core-ai/core-ai';
import { wrapGoogleError } from './google-error.ts';

describe('wrapGoogleError', () => {
    it('should map AbortError to AbortedError', () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';

        const wrapped = wrapGoogleError(error);
        expect(wrapped).toBeInstanceOf(AbortedError);
        expect(wrapped.provider).toBe('google');
    });

    it('should map abort-message ApiError without AbortError name to AbortedError', () => {
        const error = new ApiError({
            message: 'The operation was aborted',
            status: 499,
        });

        const wrapped = wrapGoogleError(error);
        expect(wrapped).toBeInstanceOf(AbortedError);
    });

    it('should map input token count overflow to ContextLengthExceededError', () => {
        const error = new ApiError({
            message:
                'input token count (50000) exceeds the maximum number of tokens allowed (32000)',
            status: 400,
        });

        const wrapped = wrapGoogleError(error);
        expect(wrapped).toBeInstanceOf(ContextLengthExceededError);
        expect((wrapped as ContextLengthExceededError).maxTokens).toBe(32000);
        expect((wrapped as ContextLengthExceededError).actualTokens).toBe(
            50000
        );
    });

    it('should map token-limit wording without counts', () => {
        const error = new ApiError({
            message: 'input exceeds the maximum number of tokens allowed',
            status: 400,
        });

        const wrapped = wrapGoogleError(error);
        expect(wrapped).toBeInstanceOf(ContextLengthExceededError);
        const classified = wrapped as ContextLengthExceededError;
        expect(classified.maxTokens).toBeUndefined();
        expect(classified.actualTokens).toBeUndefined();
    });

    it('should map 429 RESOURCE_EXHAUSTED with retry-after to RateLimitError', () => {
        const error = Object.assign(
            new ApiError({
                message: JSON.stringify({
                    error: {
                        code: 429,
                        status: 'RESOURCE_EXHAUSTED',
                        message: 'Resource exhausted',
                    },
                }),
                status: 429,
            }),
            {
                headers: new Headers({ 'retry-after': '8' }),
            }
        );

        const wrapped = wrapGoogleError(error);
        expect(wrapped).toBeInstanceOf(RateLimitError);
        expect(wrapped).toBeInstanceOf(RetryableProviderError);
        expect((wrapped as RateLimitError).retryAfterSeconds).toBe(8);
    });

    it('should map high-demand messages to ModelOverloadedError', () => {
        const error = new ApiError({
            message: 'The model is overloaded due to high demand',
            status: 503,
        });

        const wrapped = wrapGoogleError(error);
        expect(wrapped).toBeInstanceOf(ModelOverloadedError);
    });

    it('should not treat overload copy on HTTP 429 as ModelOverloadedError', () => {
        const error = new ApiError({
            message: 'The model is overloaded due to high demand',
            status: 429,
        });

        const wrapped = wrapGoogleError(error);
        expect(wrapped).toBeInstanceOf(RateLimitError);
    });

    it('should map 503 UNAVAILABLE to ServiceUnavailableError', () => {
        const error = new ApiError({
            message: JSON.stringify({
                error: {
                    code: 503,
                    status: 'UNAVAILABLE',
                    message: 'Service unavailable',
                },
            }),
            status: 503,
        });

        const wrapped = wrapGoogleError(error);
        expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
    });

    it('should map 500 to ServiceUnavailableError', () => {
        const error = new ApiError({
            message: 'Internal error',
            status: 500,
        });

        const wrapped = wrapGoogleError(error);
        expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
        expect(wrapped).toBeInstanceOf(RetryableProviderError);
    });

    it('should map opaque errors to ProviderError', () => {
        const wrapped = wrapGoogleError(new Error('unexpected'));
        expect(wrapped).toBeInstanceOf(ProviderError);
        expect(wrapped).not.toBeInstanceOf(RetryableProviderError);
        expect(wrapped.provider).toBe('google');
    });

    it('should preserve custom provider id', () => {
        const wrapped = wrapGoogleError(new Error('x'), 'google-vertex');
        expect(wrapped.provider).toBe('google-vertex');
    });
});
