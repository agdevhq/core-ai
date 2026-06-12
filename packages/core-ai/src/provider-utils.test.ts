import { describe, expect, it } from 'vitest';

import {
    asObject,
    normalizeProviderModelId,
    safeParseJsonObject,
} from './provider-utils.ts';

describe('normalizeProviderModelId', () => {
    it('strips date suffixes from dated model IDs', () => {
        expect(normalizeProviderModelId('gpt-5.2-20260215')).toBe('gpt-5.2');
    });

    it('strips dashed date suffixes from dated model IDs', () => {
        expect(normalizeProviderModelId('gpt-5.5-2026-04-23')).toBe('gpt-5.5');
    });

    it('preserves model IDs without date suffixes', () => {
        expect(normalizeProviderModelId('o4-mini')).toBe('o4-mini');
    });
});

describe('asObject', () => {
    it('returns plain object values unchanged', () => {
        expect(asObject({ key: 'value' })).toEqual({ key: 'value' });
    });

    it('returns an empty object for non-object values', () => {
        expect(asObject(['a', 'b'])).toEqual({});
        expect(asObject(null)).toEqual({});
        expect(asObject('value')).toEqual({});
    });
});

describe('safeParseJsonObject', () => {
    it('parses JSON objects', () => {
        expect(safeParseJsonObject('{"a":1}')).toEqual({ a: 1 });
    });

    it('returns an empty object for invalid or non-object JSON', () => {
        expect(safeParseJsonObject('not-json')).toEqual({});
        expect(safeParseJsonObject('[]')).toEqual({});
    });
});
