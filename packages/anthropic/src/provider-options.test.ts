import { describe, expect, it } from 'vitest';
import {
    parseAnthropicSystemMessageProviderOptions,
    parseAnthropicToolResultMessageProviderOptions,
    parseAnthropicUserMessageProviderOptions,
} from './provider-options.ts';

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

    // An untyped provider id lets these tests pass options the typed
    // `anthropic` key would reject at compile time.
    it('should reject an unsupported TTL', () => {
        expect(() =>
            parseAnthropicSystemMessageProviderOptions(
                {
                    'custom-anthropic': {
                        cacheControl: { type: 'ephemeral', ttl: '2h' },
                    },
                },
                'custom-anthropic'
            )
        ).toThrow();
    });

    it('should reject unknown fields', () => {
        expect(() =>
            parseAnthropicSystemMessageProviderOptions(
                { 'custom-anthropic': { topK: 5 } },
                'custom-anthropic'
            )
        ).toThrow();
    });
});

describe.each([
    {
        role: 'user',
        parse: parseAnthropicUserMessageProviderOptions,
    },
    {
        role: 'tool result',
        parse: parseAnthropicToolResultMessageProviderOptions,
    },
])('$role message provider options', ({ parse }) => {
    it('should read options under the provider id key', () => {
        expect(
            parse(
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
            parse(
                { anthropic: { cacheControl: { type: 'ephemeral' } } },
                'anthropic-vertex'
            )
        ).toBeUndefined();
    });

    it('should reject an unsupported TTL', () => {
        expect(() =>
            parse(
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
            parse(
                {
                    'custom-anthropic': {
                        cacheControl: { type: 'persistent' },
                    },
                },
                'custom-anthropic'
            )
        ).toThrow();
        expect(() =>
            parse({ 'custom-anthropic': { topK: 5 } }, 'custom-anthropic')
        ).toThrow();
    });
});
