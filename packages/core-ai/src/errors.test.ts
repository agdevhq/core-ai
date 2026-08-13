import { describe, expect, it } from 'vitest';
import {
    AbortedError,
    ContextLengthExceededError,
    CoreAIError,
    ModelOverloadedError,
    ProviderError,
    RateLimitError,
    RetryableProviderError,
    ServiceUnavailableError,
    StreamAbortedError,
    StructuredOutputError,
    StructuredOutputNoObjectGeneratedError,
    StructuredOutputParseError,
    StructuredOutputValidationError,
    ToolSchemaStrictnessError,
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
    it('should include provider and status code via options', () => {
        const error = new ProviderError('rate limited', 'openai', {
            statusCode: 429,
        });

        expect(error.provider).toBe('openai');
        expect(error.statusCode).toBe(429);
        expect(error).toBeInstanceOf(CoreAIError);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(RetryableProviderError);
    });

    it('should accept cause in options', () => {
        const cause = new Error('sdk');
        const error = new ProviderError('failed', 'anthropic', {
            statusCode: 500,
            cause,
        });

        expect(error.statusCode).toBe(500);
        expect(error.cause).toBe(cause);
    });
});

describe('classified ProviderError subclasses', () => {
    it('should create ContextLengthExceededError with token metadata', () => {
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
        expect(error).not.toBeInstanceOf(RetryableProviderError);
        expect(error.name).toBe('ContextLengthExceededError');
        expect(error.maxTokens).toBe(8192);
        expect(error.actualTokens).toBe(10000);
    });

    it('should create RateLimitError as retryable with retry-after', () => {
        const error = new RateLimitError('too many requests', 'openai', {
            retryAfterSeconds: 30,
        });

        expect(error).toBeInstanceOf(RetryableProviderError);
        expect(error).toBeInstanceOf(ProviderError);
        expect(error.name).toBe('RateLimitError');
        expect(error.statusCode).toBe(429);
        expect(error.retryAfterSeconds).toBe(30);
    });

    it('should create ModelOverloadedError as retryable', () => {
        const error = new ModelOverloadedError('overloaded', 'anthropic', {
            statusCode: 529,
        });

        expect(error).toBeInstanceOf(RetryableProviderError);
        expect(error.name).toBe('ModelOverloadedError');
        expect(error.statusCode).toBe(529);
    });

    it('should create ServiceUnavailableError as retryable', () => {
        const error = new ServiceUnavailableError('unavailable', 'google', {
            statusCode: 503,
        });

        expect(error).toBeInstanceOf(RetryableProviderError);
        expect(error.name).toBe('ServiceUnavailableError');
        expect(error.statusCode).toBe(503);
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

    it('should expose strict tool schema validation details', () => {
        const error = new ToolSchemaStrictnessError({
            providerId: 'anthropic',
            modelId: 'claude-sonnet-4-6',
            toolNames: ['search', 'read'],
            reason: 'limit-exceeded',
            maxStrictTools: 1,
        });

        expect(error).toBeInstanceOf(ValidationError);
        expect(error.name).toBe('ToolSchemaStrictnessError');
        expect(error.provider).toBe('anthropic');
        expect(error.providerId).toBe('anthropic');
        expect(error.modelId).toBe('claude-sonnet-4-6');
        expect(error.toolNames).toEqual(['search', 'read']);
        expect(error.reason).toBe('limit-exceeded');
        expect(error.maxStrictTools).toBe(1);
        expect(error.message).toContain('supports at most 1 strict tool');
    });

    it('should list every schema-contract violation in the message', () => {
        const error = new ToolSchemaStrictnessError({
            providerId: 'openai',
            modelId: 'gpt-4o',
            toolNames: ['search'],
            reason: 'invalid-schema',
            violations: [
                {
                    toolName: 'search',
                    path: 'properties.limit',
                    message:
                        '"limit" is optional; use .nullable() instead of .optional()',
                },
                {
                    toolName: 'search',
                    path: 'properties.query.minLength',
                    message: 'remove .min()',
                },
            ],
        });

        expect(error.reason).toBe('invalid-schema');
        expect(error.violations).toHaveLength(2);
        expect(error.message).toContain(
            'tool "search" at properties.limit: "limit" is optional'
        );
        expect(error.message).toContain(
            'tool "search" at properties.query.minLength: remove .min()'
        );
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
