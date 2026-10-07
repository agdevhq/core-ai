import { describe, expect, it } from 'vitest';
import { parseAnthropicSystemMessageProviderOptions } from './provider-options.ts';

describe('parseAnthropicSystemMessageProviderOptions', () => {
    it('should return undefined without options', () => {
        expect(
            parseAnthropicSystemMessageProviderOptions(undefined, 'anthropic')
        ).toBeUndefined();
    });

    it('should read options under the provider id key', () => {
        expect(
            parseAnthropicSystemMessageProviderOptions(
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
            parseAnthropicSystemMessageProviderOptions(
                { anthropic: { cacheControl: { type: 'ephemeral' } } },
                'anthropic-vertex'
            )
        ).toBeUndefined();
    });

    it('should reject an unsupported TTL', () => {
        expect(() =>
            parseAnthropicSystemMessageProviderOptions(
                {
                    anthropic: {
                        cacheControl: { type: 'ephemeral', ttl: '2h' },
                    },
                },
                'anthropic'
            )
        ).toThrow();
    });

    it('should reject unknown fields', () => {
        expect(() =>
            parseAnthropicSystemMessageProviderOptions(
                { anthropic: { topK: 5 } },
                'anthropic'
            )
        ).toThrow();
    });
});
