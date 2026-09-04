import { APIError, APIUserAbortError } from 'openai';
import { describe, expect, it } from 'vitest';
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
            expect(classified.maxTokens).toBe(8192);
            expect(classified.actualTokens).toBe(10000);
        });

        it('should map string_above_max_length without inventing token counts', () => {
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
            expect(classified.maxTokens).toBeUndefined();
            expect(classified.actualTokens).toBeUndefined();
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

        it('should map Azure context-window wording when code is null', () => {
            const error = APIError.generate(
                400,
                {
                    error: {
                        message:
                            'Your input exceeds the context window of this model. Please adjust your input and try again.',
                        type: 'invalid_request_error',
                        code: null,
                        param: null,
                    },
                },
                undefined,
                new Headers()
            );

            const wrapped = wrapOpenAIError(error, 'azure-openai');
            expect(wrapped).toBeInstanceOf(ContextLengthExceededError);
            const classified = wrapped as ContextLengthExceededError;
            expect(classified.provider).toBe('azure-openai');
            expect(classified.maxTokens).toBeUndefined();
            expect(classified.actualTokens).toBeUndefined();
        });

        it('should map known context_length_exceeded code without a parseable token pattern', () => {
            const error = {
                code: 'context_length_exceeded',
                error: {
                    message:
                        'Some other error message without the expected pattern',
                },
            };

            const wrapped = wrapOpenAIError(error);
            expect(wrapped).toBeInstanceOf(ContextLengthExceededError);
            const classified = wrapped as ContextLengthExceededError;
            expect(classified.maxTokens).toBeUndefined();
            expect(classified.actualTokens).toBeUndefined();
        });
    });

    describe('rate limit, overload, and availability', () => {
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
            expect(wrapped).toBeInstanceOf(RetryableProviderError);
            const classified = wrapped as RateLimitError;
            expect(classified.retryAfterSeconds).toBe(60);
        });

        it('should map insufficient_quota on 429 to ProviderQuotaExceededError', () => {
            const error = APIError.generate(
                429,
                {
                    error: {
                        message:
                            'You exceeded your current quota, please check your plan and billing details.',
                        type: 'insufficient_quota',
                        code: 'insufficient_quota',
                        param: null,
                    },
                },
                undefined,
                new Headers()
            );

            const wrapped = wrapOpenAIError(error);
            expect(wrapped).toBeInstanceOf(ProviderQuotaExceededError);
            expect(wrapped).not.toBeInstanceOf(RateLimitError);
            expect(wrapped).not.toBeInstanceOf(RetryableProviderError);
            expect((wrapped as ProviderQuotaExceededError).statusCode).toBe(
                429
            );
            expect((wrapped as ProviderQuotaExceededError).code).toBe(
                'insufficient_quota'
            );
        });

        it('should map credit_balance_exhausted on 429 to ProviderQuotaExceededError', () => {
            const error = {
                status: 429,
                code: 'credit_balance_exhausted',
                error: {
                    message: 'Your credit balance is too low',
                    code: 'credit_balance_exhausted',
                },
            };

            const wrapped = wrapOpenAIError(error);
            expect(wrapped).toBeInstanceOf(ProviderQuotaExceededError);
            expect(wrapped).not.toBeInstanceOf(RetryableProviderError);
            expect((wrapped as ProviderQuotaExceededError).code).toBe(
                'credit_balance_exhausted'
            );
        });

        it('should map HTTP 402 to ProviderQuotaExceededError', () => {
            const error = {
                status: 402,
                message: 'Payment required',
            };

            const wrapped = wrapOpenAIError(error);
            expect(wrapped).toBeInstanceOf(ProviderQuotaExceededError);
            expect(wrapped).not.toBeInstanceOf(RetryableProviderError);
            expect((wrapped as ProviderQuotaExceededError).statusCode).toBe(
                402
            );
        });

        it('should map Azure NoCapacity on 429 to ModelOverloadedError', () => {
            const error = {
                status: 429,
                code: 'NoCapacity',
                error: {
                    message:
                        'The system is currently experiencing high demand. Please retry after 5 seconds.',
                    code: 'NoCapacity',
                    type: 'invalid_request_error',
                },
            };

            const wrapped = wrapOpenAIError(error, 'azure-openai');
            expect(wrapped).toBeInstanceOf(ModelOverloadedError);
            expect(wrapped).toBeInstanceOf(RetryableProviderError);
            expect(wrapped.provider).toBe('azure-openai');
        });

        it('should classify nested Responses-shaped error bodies', () => {
            const error = {
                status: 429,
                error: {
                    message: 'You exceeded your current quota',
                    type: 'insufficient_quota',
                    code: 'insufficient_quota',
                },
            };

            const wrapped = wrapOpenAIError(error);
            expect(wrapped).toBeInstanceOf(ProviderQuotaExceededError);
            expect(wrapped).not.toBeInstanceOf(RetryableProviderError);
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
            expect(wrapped).toBeInstanceOf(RetryableProviderError);
            expect(wrapped.provider).toBe('azure-openai');
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
            expect((wrapped as ServiceUnavailableError).statusCode).toBe(503);
        });

        it('should map 500 to ServiceUnavailableError', () => {
            const error = APIError.generate(
                500,
                {
                    error: {
                        message: 'Internal server error',
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
            expect(wrapped).toBeInstanceOf(RetryableProviderError);
        });

        it('should prefer overload message cues over 503 unavailable', () => {
            const error = APIError.generate(
                503,
                {
                    error: {
                        message: 'The model is overloaded',
                        type: 'server_error',
                        code: null,
                        param: null,
                    },
                },
                undefined,
                new Headers()
            );

            const wrapped = wrapOpenAIError(error);
            expect(wrapped).toBeInstanceOf(ModelOverloadedError);
        });
    });

    describe('in-band stream errors (no HTTP status)', () => {
        it('should map rate_limit_exceeded to RateLimitError', () => {
            const error = new APIError(
                undefined,
                { code: 'rate_limit_exceeded', message: 'exceeded rate limit' },
                'exceeded rate limit',
                undefined
            );

            const wrapped = wrapOpenAIError(error, 'azure-openai');
            expect(wrapped).toBeInstanceOf(RateLimitError);
            expect((wrapped as RateLimitError).code).toBe(
                'rate_limit_exceeded'
            );
        });

        it('should map context_length_exceeded to ContextLengthExceededError', () => {
            const error = new APIError(
                undefined,
                { code: 'context_length_exceeded', message: 'too long' },
                'too long',
                undefined
            );

            const wrapped = wrapOpenAIError(error);
            expect(wrapped).toBeInstanceOf(ContextLengthExceededError);
            expect((wrapped as ContextLengthExceededError).code).toBe(
                'context_length_exceeded'
            );
        });

        it('should map server_error to ServiceUnavailableError', () => {
            const error = new APIError(
                undefined,
                { code: 'server_error', message: 'The server had an error' },
                'The server had an error',
                undefined
            );

            const wrapped = wrapOpenAIError(error);
            expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
            expect((wrapped as ServiceUnavailableError).code).toBe(
                'server_error'
            );
        });

        it('should map Azure no_capacity to ModelOverloadedError', () => {
            const error = new APIError(
                undefined,
                { code: 'no_capacity', message: '' },
                '',
                undefined
            );

            const wrapped = wrapOpenAIError(error, 'azure-openai');
            expect(wrapped).toBeInstanceOf(ModelOverloadedError);
            expect(wrapped).toBeInstanceOf(RetryableProviderError);
            expect((wrapped as ModelOverloadedError).code).toBe('no_capacity');
            expect(wrapped.provider).toBe('azure-openai');
        });

        it('should map Azure NoCapacity without status to ModelOverloadedError', () => {
            const error = new APIError(
                undefined,
                { code: 'NoCapacity', message: 'high demand' },
                'high demand',
                undefined
            );

            const wrapped = wrapOpenAIError(error, 'azure-openai');
            expect(wrapped).toBeInstanceOf(ModelOverloadedError);
            expect((wrapped as ModelOverloadedError).code).toBe('NoCapacity');
        });
    });

    describe('provider code', () => {
        it('should expose the provider error code', () => {
            const error = APIError.generate(
                429,
                {
                    error: {
                        message: 'You exceeded your current quota',
                        type: 'insufficient_quota',
                        code: 'insufficient_quota',
                        param: null,
                    },
                },
                undefined,
                new Headers()
            );

            const wrapped = wrapOpenAIError(error);
            expect(wrapped).toBeInstanceOf(ProviderError);
            expect((wrapped as ProviderError).code).toBe('insufficient_quota');
        });

        it('should fall back to the provider error type when no code is set', () => {
            const error = APIError.generate(
                400,
                {
                    error: {
                        message: 'Invalid value for parameter',
                        type: 'invalid_request_error',
                        code: null,
                        param: 'temperature',
                    },
                },
                undefined,
                new Headers()
            );

            const wrapped = wrapOpenAIError(error);
            expect((wrapped as ProviderError).code).toBe(
                'invalid_request_error'
            );
        });
    });

    it('should map opaque errors to ProviderError', () => {
        const error = new Error('something broke');
        const wrapped = wrapOpenAIError(error);

        expect(wrapped).toBeInstanceOf(ProviderError);
        expect(wrapped).not.toBeInstanceOf(RetryableProviderError);
        expect(wrapped.message).toBe('something broke');
        expect((wrapped as ProviderError).code).toBeUndefined();
    });
});
