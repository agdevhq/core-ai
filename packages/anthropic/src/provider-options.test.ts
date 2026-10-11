import { describe, expect, it } from 'vitest';
import { parseAnthropicMessageProviderOptions } from './provider-options.ts';

describe('parseAnthropicMessageProviderOptions', () => {
    it('should return undefined without options', () => {
        expect(
            parseAnthropicMessageProviderOptions(undefined, 'anthropic')
        ).toBeUndefined();
    });

    it('should read options under the provider id key', () => {
        expect(
            parseAnthropicMessageProviderOptions(
                {
                    anthropic: {
                        cacheControl: { type: 'ephemeral', ttl: '1h' },
                    },
                },
                'anthropic'
            )
        ).toEqual({ cacheControl: { type: 'ephemeral', ttl: '1h' } });
    });

    it('should ignore options under another provider id', () => {
        expect(
            parseAnthropicMessageProviderOptions(
                { anthropic: { cacheControl: { type: 'ephemeral' } } },
                'anthropic-vertex'
            )
        ).toBeUndefined();
    });

    // An untyped provider id lets these tests pass options the typed
    // `anthropic` key would reject at compile time.
    it('should reject an unsupported TTL', () => {
        expect(() =>
            parseAnthropicMessageProviderOptions(
                {
                    'custom-anthropic': {
                        cacheControl: { type: 'ephemeral', ttl: '2h' },
                    },
                },
                'custom-anthropic'
            )
        ).toThrow();
    });

    it('should reject unknown cache types and fields', () => {
        expect(() =>
            parseAnthropicMessageProviderOptions(
                {
                    'custom-anthropic': {
                        cacheControl: { type: 'persistent' },
                    },
                },
                'custom-anthropic'
            )
        ).toThrow();
        expect(() =>
            parseAnthropicMessageProviderOptions(
                { 'custom-anthropic': { topK: 5 } },
                'custom-anthropic'
            )
        ).toThrow();
    });
});
