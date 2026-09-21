import { describe, expect, it } from 'vitest';

import { normalizeOutputTokens } from './usage.ts';

describe('normalizeOutputTokens', () => {
    it('should return output tokens unchanged when reasoning is already included', () => {
        expect(normalizeOutputTokens(10, 4)).toBe(10);
        expect(normalizeOutputTokens(10, 4, 'included')).toBe(10);
    });

    it('should add reasoning tokens when the provider reports them separately', () => {
        expect(normalizeOutputTokens(10, 4, 'separate')).toBe(14);
    });

    it('should not change output tokens when no reasoning tokens are reported', () => {
        expect(normalizeOutputTokens(10, undefined, 'separate')).toBe(10);
    });
});
