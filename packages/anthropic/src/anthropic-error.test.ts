import { APIError, APIUserAbortError } from '@anthropic-ai/sdk';
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
        expect(wrapped).toBeInstanceOf(RetryableProviderError);
        expect((wrapped as ModelOverloadedError).statusCode).toBe(529);
        expect((wrapped as ModelOverloadedError).code).toBe('overloaded_error');
    });

    it('should expose the Anthropic error type as provider code', () => {
        const error = new APIError(
            400,
            {
                type: 'billing_error',
                message: 'Your credit balance is too low',
            },
            'Your credit balance is too low',
            new Headers()
        );

        const wrapped = wrapAnthropicError(error);
        expect(wrapped).toBeInstanceOf(ProviderError);
        expect(wrapped).not.toBeInstanceOf(RetryableProviderError);
        expect((wrapped as ProviderError).code).toBe('billing_error');
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
        expect(classified.retryAfterSeconds).toBe(12);
        expect(classified.code).toBe('rate_limit_error');
        expect(classified.statusCode).toBe(429);
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
        expect(wrapped.provider).toBe('anthropic-vertex');
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
        expect(wrapped).toBeInstanceOf(RetryableProviderError);
    });

    it('should not treat rate_limit_error mentioning prompt length as context', () => {
        const error = new APIError(
            429,
            {
                type: 'rate_limit_error',
                message: 'prompt is too long: 12345 tokens > 100000 maximum',
            },
            'prompt is too long: 12345 tokens > 100000 maximum',
            new Headers()
        );

        const wrapped = wrapAnthropicError(error);
        expect(wrapped).toBeInstanceOf(RateLimitError);
        expect(wrapped).not.toBeInstanceOf(ContextLengthExceededError);
    });

    it('should map streaming overloaded_error with undefined status via APIError.type', () => {
        const error = new APIError(
            undefined,
            { type: 'overloaded_error', message: 'Overloaded' },
            JSON.stringify({
                type: 'error',
                error: { type: 'overloaded_error', message: 'Overloaded' },
            }),
            new Headers()
        );

        const wrapped = wrapAnthropicError(error);
        expect(wrapped).toBeInstanceOf(ModelOverloadedError);
    });

    it('should map in-band api_error without status to ServiceUnavailableError', () => {
        const error = new APIError(
            undefined,
            { type: 'error', error: { type: 'api_error', message: 'Internal' } },
            undefined,
            new Headers(),
            'api_error'
        );

        const wrapped = wrapAnthropicError(error);
        expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
        expect(wrapped).toBeInstanceOf(RetryableProviderError);
        expect((wrapped as ServiceUnavailableError).code).toBe('api_error');
    });

    it('should map in-band timeout_error without status to ServiceUnavailableError', () => {
        const error = new APIError(
            undefined,
            {
                type: 'error',
                error: { type: 'timeout_error', message: 'Timed out' },
            },
            undefined,
            new Headers(),
            'timeout_error'
        );

        const wrapped = wrapAnthropicError(error);
        expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
        expect((wrapped as ServiceUnavailableError).code).toBe('timeout_error');
    });

    it('should map single-level Vertex RESOURCE_EXHAUSTED to RateLimitError', () => {
        const error = {
            error: {
                code: 429,
                status: 'RESOURCE_EXHAUSTED',
                message: 'Quota exceeded',
            },
        };

        const wrapped = wrapAnthropicError(error, 'anthropic-vertex');
        expect(wrapped).toBeInstanceOf(RateLimitError);
        expect(wrapped.provider).toBe('anthropic-vertex');
    });

    it('should map single-level Vertex UNAVAILABLE to ServiceUnavailableError', () => {
        const error = {
            error: {
                code: 503,
                status: 'UNAVAILABLE',
                message: 'Unavailable',
            },
        };

        const wrapped = wrapAnthropicError(error, 'anthropic-vertex');
        expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
    });

    it('should map prompt-too-long without maximum keyword', () => {
        const error = new APIError(
            400,
            {
                type: 'invalid_request_error',
                message: 'prompt is too long: 200000 tokens > 100000',
            },
            'prompt is too long: 200000 tokens > 100000',
            new Headers()
        );

        const wrapped = wrapAnthropicError(error);
        expect(wrapped).toBeInstanceOf(ContextLengthExceededError);
        const classified = wrapped as ContextLengthExceededError;
        expect(classified.maxTokens).toBe(100000);
        expect(classified.actualTokens).toBe(200000);
    });

    it('should map Input tokens exceed the context limit wording', () => {
        const error = new APIError(
            400,
            {
                type: 'invalid_request_error',
                message:
                    'Input tokens exceed the context limit of 200000 for model claude-sonnet',
            },
            'Input tokens exceed the context limit of 200000 for model claude-sonnet',
            new Headers()
        );

        const wrapped = wrapAnthropicError(error);
        expect(wrapped).toBeInstanceOf(ContextLengthExceededError);
        expect((wrapped as ContextLengthExceededError).maxTokens).toBe(200000);
    });

    it('should map opaque errors to ProviderError', () => {
        const wrapped = wrapAnthropicError(new Error('boom'));
        expect(wrapped).toBeInstanceOf(ProviderError);
        expect(wrapped).not.toBeInstanceOf(RetryableProviderError);
    });
});
