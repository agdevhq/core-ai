import { APIError, APIUserAbortError } from 'openai';
import { describe, expect, it } from 'vitest';
import {
    AbortedError,
    ContextLengthExceededError,
    ProviderError,
    RateLimitError,
    ServiceUnavailableError,
} from '@core-ai/core-ai';
import { wrapKimiError } from './kimi-error.ts';

describe('wrapKimiError', () => {
    it('should map abort errors to AbortedError', () => {
        const wrapped = wrapKimiError(new APIUserAbortError());
        expect(wrapped).toBeInstanceOf(AbortedError);
        expect(wrapped.provider).toBe('kimi');
    });

    it('should map context_length_exceeded to ContextLengthExceededError', () => {
        const error = {
            code: 'context_length_exceeded',
            error: {
                message:
                    "This model's maximum context length is 8192 tokens. However, your messages resulted in 9000 tokens.",
            },
        };

        const wrapped = wrapKimiError(error);
        expect(wrapped).toBeInstanceOf(ContextLengthExceededError);
        const classified = wrapped as ContextLengthExceededError;
        expect(classified.maxTokens).toBe(8192);
        expect(classified.actualTokens).toBe(9000);
    });

    it('should map known context_length_exceeded code without a parseable token pattern', () => {
        const error = {
            code: 'context_length_exceeded',
            error: {
                message: 'Prompt is too long for this model',
            },
        };

        const wrapped = wrapKimiError(error);
        expect(wrapped).toBeInstanceOf(ContextLengthExceededError);
        const classified = wrapped as ContextLengthExceededError;
        expect(classified.code).toBe('context_length_exceeded');
        expect(classified.maxTokens).toBeUndefined();
        expect(classified.actualTokens).toBeUndefined();
    });

    it('should map 429 to RateLimitError', () => {
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
            new Headers({ 'retry-after': '5' })
        );

        const wrapped = wrapKimiError(error);
        expect(wrapped).toBeInstanceOf(RateLimitError);
        expect((wrapped as RateLimitError).retryAfterSeconds).toBe(5);
    });

    it('should map 503 to ServiceUnavailableError', () => {
        const error = APIError.generate(
            503,
            {
                error: {
                    message: 'Unavailable',
                    type: 'server_error',
                    code: null,
                    param: null,
                },
            },
            undefined,
            new Headers()
        );

        const wrapped = wrapKimiError(error);
        expect(wrapped).toBeInstanceOf(ServiceUnavailableError);
        expect((wrapped as ServiceUnavailableError).code).toBe(
            'service_unavailable'
        );
    });

    it('should map opaque errors to ProviderError with unknown code', () => {
        const wrapped = wrapKimiError(new Error('unexpected'));
        expect(wrapped).toBeInstanceOf(ProviderError);
        expect((wrapped as ProviderError).code).toBe('unknown');
    });
});
