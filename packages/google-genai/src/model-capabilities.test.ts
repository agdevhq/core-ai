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
        expect(capabilities.reasoning.mode).toBe('always-on');
        expect(capabilities.reasoning.supportedEfforts).toEqual([
            'minimal',
            'low',
            'medium',
            'high',
            'max',
        ]);
        expect(capabilities.reasoning.restrictsSamplingParams).toBe(false);
        expect(capabilities.reasoning.thinkingParam).toBe('thinkingLevel');
    });

    it.each([
        'gemini-3.7-flash',
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.1-pro',
        'gemini-3.1-pro-preview',
        'gemini-3.1-flash-lite',
        'gemini-3.1-flash-lite-preview',
        'gemini-3-pro',
    ])('should resolve thinking-level capabilities for %s', (modelId) => {
        const capabilities = getGoogleModelCapabilities(modelId);
        expect(capabilities.reasoning.thinkingParam).toBe('thinkingLevel');
        expect(capabilities.reasoning.mode).toBe('always-on');
        expect(capabilities.reasoning.restrictsSamplingParams).toBe(false);
    });

    it('should resolve required thinking-budget capabilities for gemini-2.5-pro', () => {
        const capabilities = getGoogleModelCapabilities('gemini-2.5-pro');
        expect(capabilities.reasoning.thinkingParam).toBe('thinkingBudget');
        expect(capabilities.reasoning.mode).toBe('always-on');
        expect(capabilities.reasoning.restrictsSamplingParams).toBe(false);
    });

    it('should resolve dated model IDs to the same capabilities', () => {
        expect(getGoogleModelCapabilities('gemini-3-pro-20260215')).toEqual(
            getGoogleModelCapabilities('gemini-3-pro')
        );
    });

    it.each(['gemini-3-pro', 'gemini-2.5-pro', 'gemini-custom'])(
        'should report multimodal input as supported for %s',
        (modelId) => {
            expect(
                getGoogleModelCapabilities(modelId).modalities.input
            ).toEqual(['text', 'image', 'file', 'audio']);
            expect(
                getGoogleModelCapabilities(modelId).modalities.output
            ).toEqual(['text']);
        }
    );

    it('should return defaults for unknown models', () => {
        const capabilities = getGoogleModelCapabilities('gemini-custom');
        expect(capabilities.reasoning.thinkingParam).toBe('thinkingBudget');
        expect(capabilities.reasoning.mode).toBe('optional');
        expect(capabilities.reasoning.restrictsSamplingParams).toBe(false);
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
