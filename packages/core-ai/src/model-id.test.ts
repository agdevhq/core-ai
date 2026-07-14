import { describe, expect, it } from 'vitest';

import { stripModelDateSuffix } from './model-id.ts';

describe('stripModelDateSuffix', () => {
    it('should strip trailing YYYYMMDD date suffixes', () => {
        expect(stripModelDateSuffix('gpt-5.2-20260215')).toBe('gpt-5.2');
    });

    it('should strip trailing YYYY-MM-DD date suffixes', () => {
        expect(stripModelDateSuffix('gpt-5.5-2026-04-23')).toBe('gpt-5.5');
    });

    it('should strip trailing Vertex @YYYYMMDD date suffixes', () => {
        expect(stripModelDateSuffix('claude-haiku-4-5@20251001')).toBe(
            'claude-haiku-4-5'
        );
    });

    it('should preserve non-date Vertex aliases', () => {
        expect(stripModelDateSuffix('claude-sonnet@default')).toBe(
            'claude-sonnet@default'
        );
    });

    it('should preserve model IDs without a date suffix', () => {
        expect(stripModelDateSuffix('o4-mini')).toBe('o4-mini');
    });
});
