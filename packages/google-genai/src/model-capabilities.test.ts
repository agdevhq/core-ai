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
        'should report image input as supported for %s',
        (modelId) => {
            expect(getGoogleModelCapabilities(modelId).imageInput).toEqual({
                supported: true,
                supportedSources: ['base64', 'url'],
            });
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
