import { describe, expect, it } from 'vitest';
import {
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
    it('should return max-range capabilities for gpt-5.6-sol', () => {
        const capabilities = getOpenAIModelCapabilities('gpt-5.6-sol');
        expect(capabilities.reasoning.mode).toBe('optional');
        expect(capabilities.reasoning.supportedEfforts).toEqual([
            'low',
            'medium',
            'high',
            'max',
        ]);
        expect(capabilities.reasoning.restrictsSamplingParams).toBe(true);
    });

    it('should return high-range capabilities for gpt-5.6-terra', () => {
        const capabilities = getOpenAIModelCapabilities('gpt-5.6-terra');
        expect(capabilities.reasoning.supportedEfforts).toEqual([
            'low',
            'medium',
            'high',
        ]);
        expect(capabilities.reasoning.restrictsSamplingParams).toBe(true);
    });

    it('should return minimal-range capabilities for gpt-5.6-luna', () => {
        const capabilities = getOpenAIModelCapabilities('gpt-5.6-luna');
        expect(capabilities.reasoning.supportedEfforts).toEqual([
            'minimal',
            'low',
            'medium',
            'high',
        ]);
        expect(capabilities.reasoning.restrictsSamplingParams).toBe(true);
    });

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
        expect(capabilities.reasoning.supportedEfforts).toEqual([
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
            expect(capabilities.reasoning.supportedEfforts).toEqual([
                'medium',
                'high',
                'max',
            ]);
            expect(capabilities.reasoning.restrictsSamplingParams).toBe(true);
        }
    );

    it('should return high-only capabilities for GPT-5 Pro', () => {
        const capabilities = getOpenAIModelCapabilities('gpt-5-pro');
        expect(capabilities.reasoning.supportedEfforts).toEqual(['high']);
        expect(capabilities.reasoning.restrictsSamplingParams).toBe(true);
    });

    it('should return o-series capabilities for o3-pro', () => {
        const capabilities = getOpenAIModelCapabilities('o3-pro');
        expect(capabilities.reasoning.supportedEfforts).toEqual([
            'low',
            'medium',
            'high',
            'max',
        ]);
        expect(capabilities.reasoning.supportedEfforts).toContain('max');
        expect(capabilities.reasoning.restrictsSamplingParams).toBe(false);
    });

    it('should return unsupported capabilities for o1-mini', () => {
        const capabilities = getOpenAIModelCapabilities('o1-mini');
        expect(capabilities.reasoning.mode).toBe('unsupported');
        expect(capabilities.reasoning.supportedEfforts).toEqual([]);
    });

    it.each([
        'gpt-4.1',
        'gpt-4.1-mini',
        'gpt-4.1-nano',
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-3.5-turbo',
    ])('should return non-reasoning capabilities for %s', (modelId) => {
        const capabilities = getOpenAIModelCapabilities(modelId);

        expect(capabilities.reasoning.mode).toBe('unsupported');
        expect(capabilities.reasoning.supportedEfforts).toEqual([]);
        expect(capabilities.chatCompletions.maxTokensParameter).toBe(
            'max_tokens'
        );
    });

    it('should resolve dated model IDs to the same capabilities', () => {
        expect(getOpenAIModelCapabilities('gpt-5.2-20260215')).toEqual(
            getOpenAIModelCapabilities('gpt-5.2')
        );
        expect(getOpenAIModelCapabilities('gpt-5.5-2026-04-23')).toEqual(
            getOpenAIModelCapabilities('gpt-5.5')
        );
    });

    it('should apply defaults for unknown models', () => {
        const capabilities = getOpenAIModelCapabilities('custom-model');

        expect(capabilities.reasoning.supportedEfforts).toEqual([
            'low',
            'medium',
            'high',
        ]);
        expect(capabilities.chatCompletions.maxTokensParameter).toBe(
            'max_tokens'
        );
    });

    it.each(['gpt-5-mini', 'o3', 'o1-mini'])(
        'should require max_completion_tokens for known model %s',
        (modelId) => {
            const capabilities = getOpenAIModelCapabilities(modelId);

            expect(capabilities.chatCompletions.maxTokensParameter).toBe(
                'max_completion_tokens'
            );
        }
    );

    it.each(['gpt-5.6-sol', 'gpt-4o', 'o3', 'o1'])(
        'should report image input as supported for %s',
        (modelId) => {
            expect(getOpenAIModelCapabilities(modelId).modalities.imageInput).toBe(true);
        }
    );

    it.each(['gpt-3.5-turbo', 'o1-mini', 'o3-mini'])(
        'should report image input as unsupported for %s',
        (modelId) => {
            expect(getOpenAIModelCapabilities(modelId).modalities.imageInput).toBe(false);
        }
    );

    it('should treat unknown models as image capable', () => {
        expect(
            getOpenAIModelCapabilities('custom-model').modalities.imageInput
        ).toBe(true);
    });

    it('should preserve the Chat Completions parameter for dated model IDs', () => {
        const capabilities = getOpenAIModelCapabilities('gpt-5.5-2026-04-23');

        expect(capabilities.chatCompletions.maxTokensParameter).toBe(
            'max_completion_tokens'
        );
    });
});

describe('toOpenAIReasoningEffort', () => {
    it('should map max to xhigh', () => {
        expect(toOpenAIReasoningEffort('max')).toBe('xhigh');
    });
});
