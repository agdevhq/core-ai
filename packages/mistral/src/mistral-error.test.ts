import { describe, expect, it } from 'vitest';
import {
    AbortedError,
    ContextLengthExceededError,
    ModelOverloadedError,
    ProviderError,
    RateLimitError,
    ServiceUnavailableError,
} from '@core-ai/core-ai';
import { wrapMistralError } from './mistral-error.ts';

describe('wrapMistralError', () => {
    it('should map AbortError to AbortedError', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';

        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(AbortedError);
        expect(wrapped.provider).toBe('mistral');
    });

    it('should map too-large-for-model body to ContextLengthExceededError', () => {
        const error = {
            body: JSON.stringify({
                type: 'invalid_request_error',
                message:
                    'Prompt contains 218875 tokens and 0 draft tokens, too large for model with 32768 maximum context length',
            }),
            message:
                'Prompt contains 218875 tokens and 0 draft tokens, too large for model with 32768 maximum context length',
            statusCode: 400,
        };

        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(ContextLengthExceededError);
        const classified = wrapped as ContextLengthExceededError;
        expect(classified.maxTokens).toBe(32768);
        expect(classified.actualTokens).toBe(218875);
    });

    it('should map too-large-for-model without counts', () => {
        const error = {
            body: JSON.stringify({
                type: 'invalid_request_error',
                message: 'Prompt is too large for model',
            }),
            message: 'Prompt is too large for model',
            statusCode: 400,
        };

        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(ContextLengthExceededError);
        const classified = wrapped as ContextLengthExceededError;
        expect(classified.maxTokens).toBeUndefined();
        expect(classified.actualTokens).toBeUndefined();
    });

    it('should map 429 with retry-after to RateLimitError', () => {
        const error = {
            message: 'Rate limited',
            statusCode: 429,
            headers: new Headers({ 'retry-after': '20' }),
        };

        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(RateLimitError);
        const classified = wrapped as RateLimitError;
        expect(classified.code).toBe('rate_limit_exceeded');
        expect(classified.isRetryable).toBe(true);
        expect(classified.retryAfterSeconds).toBe(20);
    });

    it('should map rate_limit_error type without status to RateLimitError', () => {
        const error = {
            body: JSON.stringify({
                type: 'rate_limit_error',
                message: 'Rate limited',
            }),
            message: 'Rate limited',
        };

        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(RateLimitError);
        expect((wrapped as RateLimitError).code).toBe('rate_limit_exceeded');
    });

    it('should map overload copy on 503 to ModelOverloadedError', () => {
        const error = {
            message: 'The model is overloaded',
            statusCode: 503,
        };

        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(ModelOverloadedError);
        expect((wrapped as ModelOverloadedError).code).toBe('model_overloaded');
    });

    it('should map 503 to ServiceUnavailableError', () => {
        const error = {
            message: 'Unavailable',
            statusCode: 503,
        };

        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
        expect((wrapped as ServiceUnavailableError).code).toBe(
            'service_unavailable'
        );
    });

    it('should map 500 to ServiceUnavailableError', () => {
        const error = {
            message: 'Internal error',
            statusCode: 500,
        };

        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
        expect((wrapped as ServiceUnavailableError).isRetryable).toBe(true);
    });

    it('should map 502 to ServiceUnavailableError', () => {
        const error = {
            message: 'Bad gateway',
            statusCode: 502,
        };

        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
        expect((wrapped as ServiceUnavailableError).isRetryable).toBe(true);
    });

    it('should map opaque errors to ProviderError with unknown code', () => {
        const wrapped = wrapMistralError(new Error('boom'));
        expect(wrapped).toBeInstanceOf(ProviderError);
        expect((wrapped as ProviderError).code).toBe('unknown');
    });
});
