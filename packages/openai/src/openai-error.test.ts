import { APIError, APIUserAbortError } from 'openai';
import { describe, expect, it } from 'vitest';
import {
    AbortedError,
    ContextLengthExceededError,
    ProviderError,
    RateLimitError,
    ServiceUnavailableError,
} from '@core-ai/core-ai';
import { wrapOpenAIError } from './openai-error.ts';

describe('wrapOpenAIError', () => {
    it('should map abort errors to AbortedError', () => {
        const error = new APIUserAbortError();
        const wrapped = wrapOpenAIError(error);

        expect(wrapped).toBeInstanceOf(AbortedError);
        expect(wrapped.provider).toBe('openai');
    });

    it('should map AbortError by name to AbortedError', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        const wrapped = wrapOpenAIError(error, 'azure-openai');

        expect(wrapped).toBeInstanceOf(AbortedError);
        expect(wrapped.provider).toBe('azure-openai');
    });

    describe('context length', () => {
        it('should map context_length_exceeded with resulted-in pattern', () => {
            const error = {
                code: 'context_length_exceeded',
                error: {
                    message:
                        "This model's maximum context length is 8192 tokens. However, your messages resulted in 10000 tokens. Please reduce the length of the messages.",
                },
            };

            const wrapped = wrapOpenAIError(error);
            expect(wrapped).toBeInstanceOf(ContextLengthExceededError);
            const classified = wrapped as ContextLengthExceededError;
            expect(classified.code).toBe('context_length_exceeded');
            expect(classified.maxTokens).toBe(8192);
            expect(classified.actualTokens).toBe(10000);
        });

        it('should map string_above_max_length', () => {
            const error = {
                code: 'string_above_max_length',
                error: {
                    message:
                        'Expected a string with maximum length 1000, but got a string with length 2000 instead.',
                },
            };

            const wrapped = wrapOpenAIError(error);
            expect(wrapped).toBeInstanceOf(ContextLengthExceededError);
            const classified = wrapped as ContextLengthExceededError;
            expect(classified.maxTokens).toBe(1000);
            expect(classified.actualTokens).toBe(2000);
        });

        it('should map configured-limit token errors when code is null', () => {
            const error = APIError.generate(
                400,
                {
                    error: {
                        message:
                            'Input tokens exceed the configured limit of 272000 tokens. Your messages resulted in 313691 tokens. Please reduce the length of the messages.',
                        type: 'invalid_request_error',
                        code: null,
                        param: null,
                    },
                },
                undefined,
                new Headers()
            );

            const wrapped = wrapOpenAIError(error);
            expect(wrapped).toBeInstanceOf(ContextLengthExceededError);
            const classified = wrapped as ContextLengthExceededError;
            expect(classified.maxTokens).toBe(272000);
            expect(classified.actualTokens).toBe(313691);
        });

        it('should not map context_length_exceeded without a parseable pattern', () => {
            const error = {
                code: 'context_length_exceeded',
                error: {
                    message:
                        'Some other error message without the expected pattern',
                },
            };

            const wrapped = wrapOpenAIError(error);
            expect(wrapped).toBeInstanceOf(ProviderError);
            expect(wrapped).not.toBeInstanceOf(ContextLengthExceededError);
            expect((wrapped as ProviderError).code).toBe('unknown');
        });
    });

    describe('rate limit and availability', () => {
        it('should map 429 with retry-after to RateLimitError', () => {
            const error = APIError.generate(
                429,
                {
                    error: {
                        message: 'Rate limit exceeded',
                        type: 'rate_limit_error',
                        code: 'rate_limit_exceeded',
                        param: null,
                    },
                },
                undefined,
                new Headers({ 'retry-after': '60' })
            );

            const wrapped = wrapOpenAIError(error);
            expect(wrapped).toBeInstanceOf(RateLimitError);
            const classified = wrapped as RateLimitError;
            expect(classified.code).toBe('rate_limit_exceeded');
            expect(classified.isRetryable).toBe(true);
            expect(classified.retryAfterSeconds).toBe(60);
        });

        it('should map Azure backend 429 to ServiceUnavailableError', () => {
            const error = {
                status: 429,
                error: {
                    message: 'Backend error.',
                    type: 'invalid_request_error',
                },
            };

            const wrapped = wrapOpenAIError(error, 'azure-openai');
            expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
            const classified = wrapped as ServiceUnavailableError;
            expect(classified.code).toBe('service_unavailable');
            expect(classified.provider).toBe('azure-openai');
            expect(classified.isRetryable).toBe(true);
        });

        it('should map 503 to ServiceUnavailableError', () => {
            const error = APIError.generate(
                503,
                {
                    error: {
                        message: 'Service unavailable',
                        type: 'server_error',
                        code: null,
                        param: null,
                    },
                },
                undefined,
                new Headers()
            );

            const wrapped = wrapOpenAIError(error);
            expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
            const classified = wrapped as ServiceUnavailableError;
            expect(classified.code).toBe('service_unavailable');
            expect(classified.statusCode).toBe(503);
        });
    });

    it('should map opaque errors to ProviderError with unknown code', () => {
        const error = new Error('something broke');
        const wrapped = wrapOpenAIError(error);

        expect(wrapped).toBeInstanceOf(ProviderError);
        const classified = wrapped as ProviderError;
        expect(classified.code).toBe('unknown');
        expect(classified.message).toBe('something broke');
        expect(classified.isRetryable).toBe(false);
    });
});
