import { APIError, APIUserAbortError } from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import {
    AbortedError,
    ContextLengthExceededError,
    ModelOverloadedError,
    ProviderError,
    RateLimitError,
    ServiceUnavailableError,
} from '@core-ai/core-ai';
import { wrapAnthropicError } from './anthropic-error.ts';

describe('wrapAnthropicError', () => {
    it('should map abort errors to AbortedError', () => {
        const error = new APIUserAbortError();
        const wrapped = wrapAnthropicError(error);

        expect(wrapped).toBeInstanceOf(AbortedError);
        expect(wrapped.provider).toBe('anthropic');
    });

    it('should map AbortError by name to AbortedError', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        const wrapped = wrapAnthropicError(error);

        expect(wrapped).toBeInstanceOf(AbortedError);
    });

    it('should map prompt-too-long to ContextLengthExceededError', () => {
        const error = new APIError(
            400,
            {
                type: 'invalid_request_error',
                message: 'prompt is too long: 200000 tokens > 100000 maximum',
            },
            'prompt is too long: 200000 tokens > 100000 maximum',
            new Headers()
        );

        const wrapped = wrapAnthropicError(error);
        expect(wrapped).toBeInstanceOf(ContextLengthExceededError);
        const classified = wrapped as ContextLengthExceededError;
        expect(classified.code).toBe('context_length_exceeded');
        expect(classified.maxTokens).toBe(100000);
        expect(classified.actualTokens).toBe(200000);
    });

    it('should map prompt-too-long without counts', () => {
        const error = new APIError(
            400,
            {
                type: 'invalid_request_error',
                message: 'prompt is too long',
            },
            'prompt is too long',
            new Headers()
        );

        const wrapped = wrapAnthropicError(error);
        expect(wrapped).toBeInstanceOf(ContextLengthExceededError);
        const classified = wrapped as ContextLengthExceededError;
        expect(classified.maxTokens).toBeUndefined();
        expect(classified.actualTokens).toBeUndefined();
    });

    it('should map HTTP 529 / overloaded_error to ModelOverloadedError', () => {
        const error = new APIError(
            529,
            { type: 'overloaded_error', message: 'Overloaded' },
            'Overloaded',
            new Headers()
        );

        const wrapped = wrapAnthropicError(error);
        expect(wrapped).toBeInstanceOf(ModelOverloadedError);
        const classified = wrapped as ModelOverloadedError;
        expect(classified.code).toBe('model_overloaded');
        expect(classified.statusCode).toBe(529);
        expect(classified.isRetryable).toBe(true);
    });

    it('should map rate_limit_error with retry-after to RateLimitError', () => {
        const error = new APIError(
            429,
            { type: 'rate_limit_error', message: 'Rate limited' },
            'Rate limited',
            new Headers({ 'retry-after': '12' })
        );

        const wrapped = wrapAnthropicError(error);
        expect(wrapped).toBeInstanceOf(RateLimitError);
        const classified = wrapped as RateLimitError;
        expect(classified.code).toBe('rate_limit_exceeded');
        expect(classified.retryAfterSeconds).toBe(12);
    });

    it('should map Vertex RESOURCE_EXHAUSTED to RateLimitError', () => {
        const error = {
            error: {
                error: {
                    code: 429,
                    status: 'RESOURCE_EXHAUSTED',
                    message: 'Quota exceeded',
                },
            },
        };

        const wrapped = wrapAnthropicError(error, 'anthropic-vertex');
        expect(wrapped).toBeInstanceOf(RateLimitError);
        const classified = wrapped as RateLimitError;
        expect(classified.provider).toBe('anthropic-vertex');
        expect(classified.code).toBe('rate_limit_exceeded');
    });

    it('should map 503 to ServiceUnavailableError', () => {
        const error = new APIError(
            503,
            { type: 'api_error', message: 'Unavailable' },
            'Unavailable',
            new Headers()
        );

        const wrapped = wrapAnthropicError(error);
        expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
        expect((wrapped as ServiceUnavailableError).code).toBe(
            'service_unavailable'
        );
    });

    it('should map 500 to ServiceUnavailableError', () => {
        const error = new APIError(
            500,
            { type: 'api_error', message: 'Internal error' },
            'Internal error',
            new Headers()
        );

        const wrapped = wrapAnthropicError(error);
        expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
        expect((wrapped as ServiceUnavailableError).isRetryable).toBe(true);
    });

    it('should map opaque errors to ProviderError with unknown code', () => {
        const wrapped = wrapAnthropicError(new Error('boom'));
        expect(wrapped).toBeInstanceOf(ProviderError);
        expect((wrapped as ProviderError).code).toBe('unknown');
    });
});
