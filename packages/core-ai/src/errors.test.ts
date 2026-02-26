import { describe, expect, it } from 'vitest';
import {
    LLMError,
    ProviderError,
    StructuredOutputNoObjectGeneratedError,
    StructuredOutputParseError,
    StructuredOutputValidationError,
} from './errors.ts';

describe('LLMError', () => {
    it('should create an error with message', () => {
        const error = new LLMError('something failed');

        expect(error.message).toBe('something failed');
        expect(error.name).toBe('LLMError');
        expect(error).toBeInstanceOf(Error);
    });

    it('should preserve the cause', () => {
        const cause = new Error('root cause');
        const error = new LLMError('wrapper', cause);

        expect(error.cause).toBe(cause);
    });
});

describe('ProviderError', () => {
    it('should include provider and status code', () => {
        const error = new ProviderError('rate limited', 'openai', 429);

        expect(error.provider).toBe('openai');
        expect(error.statusCode).toBe(429);
        expect(error).toBeInstanceOf(LLMError);
        expect(error).toBeInstanceOf(Error);
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
        expect(error).toBeInstanceOf(ProviderError);
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
        expect(error).toBeInstanceOf(ProviderError);
    });

    it('should create a no-object-generated error', () => {
        const error = new StructuredOutputNoObjectGeneratedError(
            'model did not emit a structured output payload',
            'google'
        );

        expect(error.provider).toBe('google');
        expect(error).toBeInstanceOf(ProviderError);
    });
});
