import { describe, expect, it } from 'vitest';
import {
    getAnthropicModelCapabilities,
    getAnthropicThinkingMode,
    normalizeModelId,
    requiresAnthropicInterleavedThinkingBeta,
    restrictsAnthropicSamplingParamsAlways,
    supportsAnthropicMaxEffort,
    supportsAnthropicStrictToolSchemas,
    toAnthropicAdaptiveEffort,
    toAnthropicManualBudget,
} from './model-capabilities.js';

describe('normalizeModelId', () => {
    it('should strip date suffixes', () => {
        expect(normalizeModelId('claude-opus-4-6-20260215')).toBe(
            'claude-opus-4-6'
        );
        expect(normalizeModelId('claude-haiku-4-5@20251001')).toBe(
            'claude-haiku-4-5'
        );
    });
});

describe('getAnthropicModelCapabilities', () => {
    it.each([
        'claude-fable-5',
        'claude-mythos-5',
        'claude-mythos-preview',
        'claude-opus-5',
        'claude-opus-4-8',
        'claude-opus-4-7',
        'claude-opus-4-6',
        'claude-sonnet-5',
        'claude-sonnet-4-6',
    ])('should resolve adaptive max-effort capabilities for %s', (modelId) => {
        const capabilities = getAnthropicModelCapabilities(modelId);
        expect(capabilities.reasoning).toEqual({
            mode: 'optional',
            supportedEfforts: ['minimal', 'low', 'medium', 'high', 'max'],
            restrictsSamplingParams: true,
            supportedToolChoices: ['auto', 'none'],
        });
        expect(getAnthropicThinkingMode(modelId)).toBe('adaptive');
        expect(supportsAnthropicMaxEffort(modelId)).toBe(true);
    });

    it('should resolve manual thinking capabilities', () => {
        const capabilities = getAnthropicModelCapabilities('claude-opus-4-5');
        expect(capabilities.reasoning).toEqual({
            mode: 'optional',
            supportedEfforts: ['minimal', 'low', 'medium', 'high', 'max'],
            restrictsSamplingParams: true,
            supportedToolChoices: ['auto', 'none'],
        });
        expect(getAnthropicThinkingMode('claude-opus-4-5')).toBe('manual');
        expect(supportsAnthropicMaxEffort('claude-opus-4-5')).toBe(false);
    });

    it('should resolve dated model IDs to the same capabilities', () => {
        expect(
            getAnthropicModelCapabilities('claude-opus-4-6-20260215')
        ).toEqual(getAnthropicModelCapabilities('claude-opus-4-6'));
        expect(supportsAnthropicMaxEffort('claude-opus-4-6-20260215')).toBe(
            true
        );
        expect(getAnthropicThinkingMode('claude-haiku-4-5@20251001')).toBe(
            'manual'
        );
    });

    it.each(['claude-opus-5', 'claude-haiku-4-5', 'claude-future-5'])(
        'should report multimodal input as supported for %s',
        (modelId) => {
            expect(
                getAnthropicModelCapabilities(modelId).modalities.input
            ).toEqual(['text', 'image', 'file']);
            expect(
                getAnthropicModelCapabilities(modelId).modalities.output
            ).toEqual(['text']);
        }
    );

    it('should fallback to defaults for unknown models', () => {
        const capabilities = getAnthropicModelCapabilities('claude-future-5');
        expect(capabilities.reasoning.mode).toBe('optional');
        expect(capabilities.reasoning.supportedEfforts).toEqual([
            'minimal',
            'low',
            'medium',
            'high',
        ]);
        expect(capabilities.reasoning.restrictsSamplingParams).toBe(true);
        expect(getAnthropicThinkingMode('claude-future-5')).toBe('adaptive');
    });

    it.each([
        'claude-fable-5',
        'claude-mythos-5',
        'claude-mythos-preview',
        'claude-opus-5',
        'claude-opus-4-8',
        'claude-opus-4-7',
        'claude-opus-4-6',
        'claude-sonnet-5',
        'claude-sonnet-4-6',
        'claude-sonnet-4-5-20250929',
        'claude-opus-4-5-20251101',
        'claude-haiku-4-5-20251001',
        // Unknown/future ids resolve optimistically to supported.
        'claude-future-6',
    ])('should support strict tool schemas for %s', (modelId) => {
        expect(supportsAnthropicStrictToolSchemas(modelId)).toBe(true);
        expect(
            getAnthropicModelCapabilities(modelId).tools.strictSchemas
        ).toEqual({
            supported: true,
            maxStrictTools: 20,
        });
    });

    it.each([
        'claude-sonnet-4',
        'claude-opus-4-1',
        'claude-sonnet-3-7',
        'claude-3-5-sonnet-20241022',
    ])('should not claim strict tool schema support for %s', (modelId) => {
        expect(supportsAnthropicStrictToolSchemas(modelId)).toBe(false);
        expect(
            getAnthropicModelCapabilities(modelId).tools.strictSchemas
        ).toEqual({ supported: false });
    });
});

describe('effort mapping', () => {
    it('should map adaptive max based on model support', () => {
        expect(toAnthropicAdaptiveEffort('max', true)).toBe('max');
        expect(toAnthropicAdaptiveEffort('max', false)).toBe('high');
    });

    it('should map manual budgets', () => {
        expect(toAnthropicManualBudget('minimal')).toBe(1024);
        expect(toAnthropicManualBudget('max')).toBe(65536);
        expect(toAnthropicManualBudget('medium', 4096)).toBe(4095);
    });
});

describe('interleaved thinking beta', () => {
    it('should only require the beta for supported manual-thinking models', () => {
        expect(
            requiresAnthropicInterleavedThinkingBeta('claude-sonnet-4-5')
        ).toBe(true);
        expect(
            requiresAnthropicInterleavedThinkingBeta('claude-sonnet-5')
        ).toBe(false);
        expect(
            requiresAnthropicInterleavedThinkingBeta('claude-haiku-4-5')
        ).toBe(false);
    });
});

describe('sampling restrictions', () => {
    it('should identify models that always reject non-default sampling', () => {
        expect(restrictsAnthropicSamplingParamsAlways('claude-opus-5')).toBe(
            true
        );
        expect(restrictsAnthropicSamplingParamsAlways('claude-sonnet-5')).toBe(
            true
        );
        expect(
            restrictsAnthropicSamplingParamsAlways('claude-sonnet-4-6')
        ).toBe(false);
    });
});
