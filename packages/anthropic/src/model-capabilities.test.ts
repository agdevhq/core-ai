import { describe, expect, it } from 'vitest';
import {
    getAnthropicModelCapabilities,
    getAnthropicThinkingMode,
    normalizeModelId,
    supportsAnthropicMaxEffort,
    toAnthropicAdaptiveEffort,
    toAnthropicManualBudget,
} from './model-capabilities.js';

describe('normalizeModelId', () => {
    it('should strip date suffixes', () => {
        expect(normalizeModelId('claude-opus-4-6-20260215')).toBe(
            'claude-opus-4-6'
        );
    });
});

describe('getAnthropicModelCapabilities', () => {
    it.each([
        'claude-fable-5',
        'claude-mythos-5',
        'claude-mythos-preview',
        'claude-opus-4-8',
        'claude-opus-4-7',
        'claude-opus-4-6',
        'claude-sonnet-5',
        'claude-sonnet-4-6',
    ])('should resolve adaptive max-effort capabilities for %s', (modelId) => {
        const capabilities = getAnthropicModelCapabilities(modelId);
        expect(capabilities.reasoning).toEqual({
            supported: true,
            supportedEfforts: ['minimal', 'low', 'medium', 'high', 'max'],
            restrictsSamplingParams: true,
        });
        expect(getAnthropicThinkingMode(modelId)).toBe('adaptive');
        expect(supportsAnthropicMaxEffort(modelId)).toBe(true);
    });

    it('should resolve manual thinking capabilities', () => {
        const capabilities = getAnthropicModelCapabilities('claude-opus-4-5');
        expect(capabilities.reasoning).toEqual({
            supported: true,
            supportedEfforts: ['minimal', 'low', 'medium', 'high'],
            restrictsSamplingParams: true,
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
    });

    it('should fallback to defaults for unknown models', () => {
        const capabilities = getAnthropicModelCapabilities('claude-future-5');
        expect(capabilities.reasoning.supported).toBe(true);
        expect(capabilities.reasoning.supportedEfforts).toEqual([
            'minimal',
            'low',
            'medium',
            'high',
        ]);
        expect(capabilities.reasoning.restrictsSamplingParams).toBe(true);
        expect(getAnthropicThinkingMode('claude-future-5')).toBe('adaptive');
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
    });
});
