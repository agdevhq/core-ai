import { describe, expect, it } from 'vitest';
import {
    getAnthropicModelCapabilities,
    getAnthropicThinkingMode,
    isAnthropicThinkingAlwaysOn,
    normalizeModelId,
    rejectsAnthropicForcedToolChoiceAlways,
    requiresAnthropicInterleavedThinkingBeta,
    restrictsAnthropicSamplingParamsAlways,
    supportsAnthropicMaxEffort,
    supportsAnthropicStrictToolSchemas,
    toAnthropicAdaptiveEffort,
    toAnthropicManualBudget,
} from './model-capabilities.ts';

describe('normalizeModelId', () => {
    it('should strip date suffixes', () => {
        expect(normalizeModelId('claude-opus-4-6-20260215')).toBe(
            'claude-opus-4-6'
        );
        expect(normalizeModelId('claude-haiku-4-5@20251001')).toBe(
            'claude-haiku-4-5'
        );
        expect(normalizeModelId('claude-opus-5-5')).toBe('claude-opus-5-5');
        expect(normalizeModelId('claude-fable-5-1')).toBe('claude-fable-5-1');
        expect(normalizeModelId('claude-mythos-5-1')).toBe('claude-mythos-5-1');
        expect(normalizeModelId('claude-sonnet-5-5')).toBe('claude-sonnet-5-5');
        expect(normalizeModelId('claude-sonnet-5-5-20260928')).toBe(
            'claude-sonnet-5-5'
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
        'claude-sonnet-5-5',
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
        expect(isAnthropicThinkingAlwaysOn(modelId)).toBe(false);
    });

    it.each(['claude-opus-5-5', 'claude-fable-5-1', 'claude-mythos-5-1'])(
        'should resolve always-on adaptive thinking for %s',
        (modelId) => {
            const capabilities = getAnthropicModelCapabilities(modelId);
            expect(capabilities.reasoning).toEqual({
                mode: 'always-on',
                supportedEfforts: ['minimal', 'low', 'medium', 'high', 'max'],
                restrictsSamplingParams: true,
                supportedToolChoices: ['auto', 'none'],
            });
            expect(getAnthropicThinkingMode(modelId)).toBe('adaptive');
            expect(supportsAnthropicMaxEffort(modelId)).toBe(true);
            expect(isAnthropicThinkingAlwaysOn(modelId)).toBe(true);
            expect(restrictsAnthropicSamplingParamsAlways(modelId)).toBe(true);
            expect(rejectsAnthropicForcedToolChoiceAlways(modelId)).toBe(true);
        }
    );

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
        expect(
            getAnthropicModelCapabilities('claude-sonnet-5-5-20260928')
        ).toEqual(getAnthropicModelCapabilities('claude-sonnet-5-5'));
        expect(
            getAnthropicModelCapabilities('claude-fable-5-1-20260915')
        ).toEqual(getAnthropicModelCapabilities('claude-fable-5-1'));
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
        'claude-fable-5-1',
        'claude-mythos-5-1',
        'claude-fable-5',
        'claude-mythos-5',
        'claude-mythos-preview',
        'claude-opus-5-5',
        'claude-opus-5',
        'claude-opus-4-8',
        'claude-opus-4-7',
        'claude-opus-4-6',
        'claude-sonnet-5-5',
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
        'claude-2.1',
        'claude-instant-1.2',
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

    it('should map manual budgets from the model ceiling', () => {
        expect(toAnthropicManualBudget('minimal', 64_000)).toBe(1024);
        expect(toAnthropicManualBudget('medium', 64_000)).toBe(8192);
        expect(toAnthropicManualBudget('high', 64_000)).toBe(32_000);
        expect(toAnthropicManualBudget('max', 64_000)).toBe(48_000);
        expect(toAnthropicManualBudget('high', 32_000)).toBe(16_000);
        expect(toAnthropicManualBudget('max', 32_000)).toBe(24_000);
    });
});

describe('output ceilings', () => {
    it.each([
        ['claude-fable-5-1', 128_000],
        ['claude-mythos-5-1', 128_000],
        ['claude-fable-5', 128_000],
        ['claude-mythos-5', 128_000],
        ['claude-mythos-preview', 128_000],
        ['claude-opus-5-5', 128_000],
        ['claude-opus-5', 128_000],
        ['claude-opus-4-8', 128_000],
        ['claude-opus-4-7', 128_000],
        ['claude-opus-4-6', 128_000],
        ['claude-sonnet-5-5', 128_000],
        ['claude-sonnet-5', 128_000],
        ['claude-sonnet-4-6', 128_000],
        ['claude-opus-4-5-20251101', 64_000],
        ['claude-sonnet-4-5-20250929', 64_000],
        ['claude-haiku-4-5@20251001', 64_000],
        ['claude-sonnet-4-20250514', 64_000],
        ['claude-3-7-sonnet-20250219', 64_000],
        ['claude-opus-4-1-20250805', 32_000],
        ['claude-opus-4-20250514', 32_000],
    ])('should report the output ceiling of %s', (modelId, maxTokens) => {
        expect(getAnthropicModelCapabilities(modelId).output).toEqual({
            maxTokens,
        });
    });

    it('should leave the ceiling unknown for unrecognized models', () => {
        expect(
            getAnthropicModelCapabilities('claude-future-9').output
        ).toBeUndefined();
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

describe('forced tool choice', () => {
    it.each([
        'claude-opus-5-5',
        'claude-sonnet-5-5',
        'claude-fable-5-1',
        'claude-mythos-5-1',
        'claude-sonnet-5-5-20260928',
    ])(
        'should reject forced tool choice on every request for %s',
        (modelId) => {
            expect(rejectsAnthropicForcedToolChoiceAlways(modelId)).toBe(true);
        }
    );

    it.each([
        'claude-fable-5',
        'claude-mythos-5',
        'claude-opus-5',
        'claude-sonnet-5',
    ])(
        'should allow forced tool choice when reasoning is omitted for %s',
        (modelId) => {
            expect(rejectsAnthropicForcedToolChoiceAlways(modelId)).toBe(false);
            expect(isAnthropicThinkingAlwaysOn(modelId)).toBe(false);
        }
    );
});

describe('sampling restrictions', () => {
    it('should identify models that always reject non-default sampling', () => {
        expect(restrictsAnthropicSamplingParamsAlways('claude-opus-5-5')).toBe(
            true
        );
        expect(restrictsAnthropicSamplingParamsAlways('claude-fable-5-1')).toBe(
            true
        );
        expect(
            restrictsAnthropicSamplingParamsAlways('claude-mythos-5-1')
        ).toBe(true);
        expect(restrictsAnthropicSamplingParamsAlways('claude-opus-5')).toBe(
            true
        );
        expect(
            restrictsAnthropicSamplingParamsAlways('claude-sonnet-5-5')
        ).toBe(true);
        expect(restrictsAnthropicSamplingParamsAlways('claude-sonnet-5')).toBe(
            true
        );
        expect(
            restrictsAnthropicSamplingParamsAlways('claude-sonnet-4-6')
        ).toBe(false);
    });
});
