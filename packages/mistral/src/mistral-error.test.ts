import { describe, expect, it } from 'vitest';
import { RequestTimeoutError } from '@mistralai/mistralai/models/errors';
import {
    AbortedError,
    ContextLengthExceededError,
    ModelOverloadedError,
    ProviderError,
    ProviderQuotaExceededError,
    RateLimitError,
    RetryableProviderError,
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
        expect(wrapped).toBeInstanceOf(RetryableProviderError);
        expect((wrapped as RateLimitError).retryAfterSeconds).toBe(20);
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
    });

    it('should map HTTP 402 to ProviderQuotaExceededError', () => {
        const error = {
            message: 'Payment required',
            statusCode: 402,
        };

        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(ProviderQuotaExceededError);
        expect(wrapped).not.toBeInstanceOf(RetryableProviderError);
        expect((wrapped as ProviderQuotaExceededError).statusCode).toBe(402);
    });

    it('should map overload copy on 503 to ModelOverloadedError', () => {
        const error = {
            message: 'The model is overloaded',
            statusCode: 503,
        };

        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(ModelOverloadedError);
    });

    it('should map service tier capacity exceeded on 503 to ServiceUnavailableError', () => {
        const error = {
            message: 'service tier capacity exceeded',
            statusCode: 503,
        };

        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
        expect(wrapped).not.toBeInstanceOf(RateLimitError);
        expect(wrapped).not.toBeInstanceOf(ModelOverloadedError);
    });

    it('should map in-band service tier capacity exceeded without status to ServiceUnavailableError', () => {
        const error = {
            message: 'service tier capacity exceeded',
        };

        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
        expect(wrapped).toBeInstanceOf(RetryableProviderError);
        expect(wrapped).not.toBeInstanceOf(RateLimitError);
        expect(wrapped).not.toBeInstanceOf(ModelOverloadedError);
    });

    it('should map 503 to ServiceUnavailableError', () => {
        const error = {
            message: 'Unavailable',
            statusCode: 503,
        };

        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
    });

    it('should map 500 to ServiceUnavailableError', () => {
        const error = {
            message: 'Internal error',
            statusCode: 500,
        };

        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
        expect(wrapped).toBeInstanceOf(RetryableProviderError);
    });

    it('should map 502 to ServiceUnavailableError', () => {
        const error = {
            message: 'Bad gateway',
            statusCode: 502,
        };

        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
        expect(wrapped).toBeInstanceOf(RetryableProviderError);
    });

    it('should map RequestTimeoutError to ServiceUnavailableError', () => {
        const error = new RequestTimeoutError('Request timed out');
        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
        expect(wrapped).toBeInstanceOf(RetryableProviderError);
        expect(wrapped).not.toBeInstanceOf(AbortedError);
    });

    it('should map exceeds maximum context length wording', () => {
        const error = {
            body: JSON.stringify({
                type: 'invalid_request_error',
                message:
                    "The number of tokens in the prompt exceeds the model's maximum context length of 32768",
            }),
            message:
                "The number of tokens in the prompt exceeds the model's maximum context length of 32768",
            statusCode: 400,
        };

        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(ContextLengthExceededError);
        expect((wrapped as ContextLengthExceededError).maxTokens).toBe(32768);
    });

    it('should not treat 422 stringified detail JSON as context length', () => {
        const error = {
            body: JSON.stringify({
                type: 'internal_error_proxy',
                message: JSON.stringify({
                    detail: [
                        {
                            loc: ['body', 'foo'],
                            msg: 'extra fields not permitted',
                            type: 'value_error',
                        },
                    ],
                }),
            }),
            message: 'Validation error',
            statusCode: 422,
        };

        const wrapped = wrapMistralError(error);
        expect(wrapped).toBeInstanceOf(ProviderError);
        expect(wrapped).not.toBeInstanceOf(ContextLengthExceededError);
    });

    it('should map opaque errors to ProviderError', () => {
        const wrapped = wrapMistralError(new Error('boom'));
        expect(wrapped).toBeInstanceOf(ProviderError);
        expect(wrapped).not.toBeInstanceOf(RetryableProviderError);
    });
});
