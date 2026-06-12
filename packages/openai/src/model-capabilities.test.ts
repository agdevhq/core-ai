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

    it('should strip dashed date suffixes', () => {
        expect(normalizeModelId('gpt-5.5-2026-04-23')).toBe('gpt-5.5');
    });

    it('should preserve model IDs without date suffix', () => {
        expect(normalizeModelId('o4-mini')).toBe('o4-mini');
    });
});

describe('getOpenAIModelCapabilities', () => {
    it.each([
        'gpt-5.5',
        'gpt-5.4',
        'gpt-5.4-mini',
        'gpt-5.4-nano',
        'gpt-5.3-codex',
        'gpt-5.2',
        'gpt-5.1-codex',
        'gpt-5.1-codex-max',
        'gpt-5.1-codex-mini',
        'gpt-5-codex',
    ])('should return max-range capabilities for %s', (modelId) => {
        const capabilities = getOpenAIModelCapabilities(modelId);
        expect(capabilities.reasoning.supportedRange).toEqual([
            'low',
            'medium',
            'high',
            'max',
        ]);
        expect(capabilities.reasoning.restrictsSamplingParams).toBe(true);
    });

    it.each(['gpt-5.5-pro', 'gpt-5.4-pro'])(
        'should return pro capabilities for %s',
        (modelId) => {
            const capabilities = getOpenAIModelCapabilities(modelId);
            expect(capabilities.reasoning.supportedRange).toEqual([
                'medium',
                'high',
                'max',
            ]);
            expect(capabilities.reasoning.restrictsSamplingParams).toBe(true);
        }
    );

    it('should return high-only capabilities for GPT-5 Pro', () => {
        const capabilities = getOpenAIModelCapabilities('gpt-5-pro');
        expect(capabilities.reasoning.supportedRange).toEqual(['high']);
        expect(capabilities.reasoning.restrictsSamplingParams).toBe(true);
    });

    it('should return o-series capabilities for o3-pro', () => {
        const capabilities = getOpenAIModelCapabilities('o3-pro');
        expect(capabilities.reasoning.supportedRange).toEqual([
            'low',
            'medium',
            'high',
            'max',
        ]);
        expect(capabilities.reasoning.supportedRange).toContain('max');
        expect(capabilities.reasoning.restrictsSamplingParams).toBe(false);
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
