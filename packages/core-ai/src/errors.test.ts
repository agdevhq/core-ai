import { describe, expect, it } from 'vitest';
import {
    AbortedError,
    ContextLengthExceededError,
    CoreAIError,
    ModelOverloadedError,
    ProviderError,
    RateLimitError,
    ServiceUnavailableError,
    StreamAbortedError,
    StructuredOutputError,
    StructuredOutputNoObjectGeneratedError,
    StructuredOutputParseError,
    StructuredOutputValidationError,
    ValidationError,
} from './errors.ts';

describe('CoreAIError', () => {
    it('should create an error with message', () => {
        const error = new CoreAIError('something failed');

        expect(error.message).toBe('something failed');
        expect(error.name).toBe('CoreAIError');
        expect(error).toBeInstanceOf(Error);
    });

    it('should preserve the cause', () => {
        const cause = new Error('root cause');
        const error = new CoreAIError('wrapper', cause);

        expect(error.cause).toBe(cause);
    });

    it('should preserve optional provider metadata', () => {
        const error = new CoreAIError('wrapper', undefined, 'openai');

        expect(error.provider).toBe('openai');
    });
});

describe('ProviderError', () => {
    it('should include provider and status code with default unknown code', () => {
        const error = new ProviderError('rate limited', 'openai', 429);

        expect(error.provider).toBe('openai');
        expect(error.statusCode).toBe(429);
        expect(error.code).toBe('unknown');
        expect(error.isRetryable).toBe(false);
        expect(error).toBeInstanceOf(CoreAIError);
        expect(error).toBeInstanceOf(Error);
    });

    it('should accept options object for code and cause', () => {
        const cause = new Error('sdk');
        const error = new ProviderError('failed', 'anthropic', {
            code: 'unknown',
            statusCode: 500,
            cause,
        });

        expect(error.code).toBe('unknown');
        expect(error.statusCode).toBe(500);
        expect(error.cause).toBe(cause);
        expect(error.isRetryable).toBe(false);
    });
});

describe('classified ProviderError subclasses', () => {
    it('should create ContextLengthExceededError with fixed code and token metadata', () => {
        const error = new ContextLengthExceededError(
            'context too long',
            'openai',
            {
                statusCode: 400,
                maxTokens: 8192,
                actualTokens: 10000,
            }
        );

        expect(error).toBeInstanceOf(ProviderError);
        expect(error.name).toBe('ContextLengthExceededError');
        expect(error.code).toBe('context_length_exceeded');
        expect(error.maxTokens).toBe(8192);
        expect(error.actualTokens).toBe(10000);
        expect(error.isRetryable).toBe(false);
    });

    it('should create RateLimitError with fixed code and retry-after', () => {
        const error = new RateLimitError('too many requests', 'openai', {
            retryAfterSeconds: 30,
        });

        expect(error).toBeInstanceOf(ProviderError);
        expect(error.name).toBe('RateLimitError');
        expect(error.code).toBe('rate_limit_exceeded');
        expect(error.statusCode).toBe(429);
        expect(error.retryAfterSeconds).toBe(30);
        expect(error.isRetryable).toBe(true);
    });

    it('should create ModelOverloadedError with fixed code', () => {
        const error = new ModelOverloadedError('overloaded', 'anthropic', {
            statusCode: 529,
        });

        expect(error).toBeInstanceOf(ProviderError);
        expect(error.name).toBe('ModelOverloadedError');
        expect(error.code).toBe('model_overloaded');
        expect(error.statusCode).toBe(529);
        expect(error.isRetryable).toBe(true);
    });

    it('should create ServiceUnavailableError with fixed code', () => {
        const error = new ServiceUnavailableError('unavailable', 'google', {
            statusCode: 503,
        });

        expect(error).toBeInstanceOf(ProviderError);
        expect(error.name).toBe('ServiceUnavailableError');
        expect(error.code).toBe('service_unavailable');
        expect(error.statusCode).toBe(503);
        expect(error.isRetryable).toBe(true);
    });
});

describe('ValidationError', () => {
    it('should represent local request validation failures', () => {
        const error = new ValidationError(
            'messages must not be empty',
            undefined,
            'openai'
        );

        expect(error.message).toBe('messages must not be empty');
        expect(error.name).toBe('ValidationError');
        expect(error.provider).toBe('openai');
        expect(error).toBeInstanceOf(CoreAIError);
    });
});

describe('AbortedError', () => {
    it('should create a standardized abort error', () => {
        const cause = new Error('AbortError');
        const error = new AbortedError(cause, 'openai');

        expect(error.message).toBe('operation aborted');
        expect(error.name).toBe('AbortedError');
        expect(error.cause).toBe(cause);
        expect(error.provider).toBe('openai');
        expect(error).toBeInstanceOf(CoreAIError);
    });

    it('should make stream aborts a specialized abort error', () => {
        const error = new StreamAbortedError();

        expect(error).toBeInstanceOf(AbortedError);
        expect(error.name).toBe('StreamAbortedError');
    });
});

describe('StructuredOutput errors', () => {
    it('should preserve provider and raw output for parse errors', () => {
        const error = new StructuredOutputParseError(
            'failed to parse json',
            'openai',
            {
                rawOutput: '{invalid-json',
            }
        );

        expect(error.provider).toBe('openai');
        expect(error.rawOutput).toBe('{invalid-json');
        expect(error).toBeInstanceOf(StructuredOutputError);
        expect(error).toBeInstanceOf(CoreAIError);
    });

    it('should preserve validation issues', () => {
        const error = new StructuredOutputValidationError(
            'schema mismatch',
            'anthropic',
            ['city: Required', 'temperatureC: Expected number']
        );

        expect(error.issues).toEqual([
            'city: Required',
            'temperatureC: Expected number',
        ]);
        expect(error.provider).toBe('anthropic');
        expect(error).toBeInstanceOf(StructuredOutputError);
    });

    it('should create a no-object-generated error', () => {
        const error = new StructuredOutputNoObjectGeneratedError(
            'model did not emit a structured output payload',
            'google'
        );

        expect(error.provider).toBe('google');
        expect(error).toBeInstanceOf(StructuredOutputError);
    });
});
