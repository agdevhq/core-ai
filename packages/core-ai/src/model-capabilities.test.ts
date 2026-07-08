import { describe, expect, it } from 'vitest';
import { clampReasoningEffort } from './model-capabilities.ts';

describe('clampReasoningEffort', () => {
    it('returns the effort when it is already supported', () => {
        expect(clampReasoningEffort('medium', ['low', 'medium', 'high'])).toBe(
            'medium'
        );
    });

    it('returns the original effort when the supported list is empty', () => {
        expect(clampReasoningEffort('high', [])).toBe('high');
    });

    it('clamps to the nearest supported effort', () => {
        expect(clampReasoningEffort('minimal', ['low', 'medium', 'high'])).toBe(
            'low'
        );
        expect(clampReasoningEffort('max', ['low', 'medium', 'high'])).toBe(
            'high'
        );
        expect(clampReasoningEffort('medium', ['high'])).toBe('high');
    });
});
