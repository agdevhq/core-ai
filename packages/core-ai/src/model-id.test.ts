import { describe, expect, it } from 'vitest';

import { stripModelDateSuffix } from './model-id.ts';

describe('stripModelDateSuffix', () => {
    it('should strip trailing YYYYMMDD date suffixes', () => {
        expect(stripModelDateSuffix('gpt-5.2-20260215')).toBe('gpt-5.2');
    });

    it('should strip trailing YYYY-MM-DD date suffixes', () => {
        expect(stripModelDateSuffix('gpt-5.5-2026-04-23')).toBe('gpt-5.5');
    });

    it('should preserve model IDs without a date suffix', () => {
        expect(stripModelDateSuffix('o4-mini')).toBe('o4-mini');
    });
});
