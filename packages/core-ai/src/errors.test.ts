import { describe, expect, it } from 'vitest';
import { LLMError, ProviderError } from './errors.ts';

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
