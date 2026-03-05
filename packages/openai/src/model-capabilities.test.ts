import { describe, expect, it } from 'vitest';
import {
    clampReasoningEffort,
    getOpenAIModelCapabilities,
    normalizeModelId,
    toOpenAIReasoningEffort,
} from './model-capabilities.js';

describe('normalizeModelId', () => {
    it('should strip date suffixes', () => {
        expect(normalizeModelId('gpt-5.2-20260215')).toBe('gpt-5.2');
    });

    it('should preserve model IDs without date suffix', () => {
        expect(normalizeModelId('o4-mini')).toBe('o4-mini');
    });
});

describe('getOpenAIModelCapabilities', () => {
    it('should return explicit capabilities for known models', () => {
        expect(
            getOpenAIModelCapabilities('gpt-5.2').reasoning.supportedRange
        ).toEqual(['low', 'medium', 'high', 'max']);
    });

    it('should apply defaults for unknown models', () => {
        expect(
            getOpenAIModelCapabilities('custom-model').reasoning.supportedRange
        ).toEqual(['low', 'medium', 'high']);
    });
});

describe('clampReasoningEffort', () => {
    it('should keep supported levels unchanged', () => {
        expect(clampReasoningEffort('high', ['low', 'medium', 'high'])).toBe(
            'high'
        );
    });

    it('should clamp to nearest supported level', () => {
        expect(clampReasoningEffort('max', ['low', 'medium', 'high'])).toBe(
            'high'
        );
    });
});

describe('toOpenAIReasoningEffort', () => {
    it('should map max to xhigh', () => {
        expect(toOpenAIReasoningEffort('max')).toBe('xhigh');
    });
});
