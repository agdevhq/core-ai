import { describe, expect, it } from 'vitest';
import {
    getGoogleModelCapabilities,
    normalizeModelId,
    toGoogleThinkingBudget,
    toGoogleThinkingLevel,
} from './model-capabilities.js';

describe('normalizeModelId', () => {
    it('should strip date suffixes', () => {
        expect(normalizeModelId('gemini-2.5-pro-20260215')).toBe(
            'gemini-2.5-pro'
        );
    });
});

describe('getGoogleModelCapabilities', () => {
    it('should resolve known model capabilities', () => {
        const capabilities = getGoogleModelCapabilities('gemini-3-pro');
        expect(capabilities.reasoning.thinkingParam).toBe('thinkingLevel');
    });

    it('should return defaults for unknown models', () => {
        const capabilities = getGoogleModelCapabilities('gemini-custom');
        expect(capabilities.reasoning.thinkingParam).toBe('thinkingBudget');
    });
});

describe('reasoning mapping', () => {
    it('should map effort to thinking level', () => {
        expect(toGoogleThinkingLevel('minimal')).toBe('LOW');
        expect(toGoogleThinkingLevel('max')).toBe('HIGH');
    });

    it('should map effort to thinking budget', () => {
        expect(toGoogleThinkingBudget('minimal')).toBe(1024);
        expect(toGoogleThinkingBudget('high')).toBe(32768);
    });
});
