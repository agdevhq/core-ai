import { ApiError } from '@google/genai';
import { describe, expect, it } from 'vitest';
import {
    AbortedError,
    ContextLengthExceededError,
    ModelOverloadedError,
    ProviderError,
    RateLimitError,
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

    it('should map 429 RESOURCE_EXHAUSTED to RateLimitError', () => {
        const error = new ApiError({
            message: JSON.stringify({
                error: {
                    code: 429,
                    status: 'RESOURCE_EXHAUSTED',
                    message: 'Resource exhausted',
                },
            }),
            status: 429,
        });

        const wrapped = wrapGoogleError(error);
        expect(wrapped).toBeInstanceOf(RateLimitError);
        const classified = wrapped as RateLimitError;
        expect(classified.code).toBe('rate_limit_exceeded');
        expect(classified.isRetryable).toBe(true);
    });

    it('should map high-demand messages to ModelOverloadedError', () => {
        const error = new ApiError({
            message: 'The model is overloaded due to high demand',
            status: 503,
        });

        const wrapped = wrapGoogleError(error);
        expect(wrapped).toBeInstanceOf(ModelOverloadedError);
        expect((wrapped as ModelOverloadedError).code).toBe('model_overloaded');
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
        expect((wrapped as ServiceUnavailableError).code).toBe(
            'service_unavailable'
        );
    });

    it('should map opaque errors to ProviderError with unknown code', () => {
        const wrapped = wrapGoogleError(new Error('unexpected'));
        expect(wrapped).toBeInstanceOf(ProviderError);
        expect((wrapped as ProviderError).code).toBe('unknown');
        expect(wrapped.provider).toBe('google');
    });

    it('should preserve custom provider id', () => {
        const wrapped = wrapGoogleError(new Error('x'), 'google-vertex');
        expect(wrapped.provider).toBe('google-vertex');
    });
});
