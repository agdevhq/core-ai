import { describe, expect, it } from 'vitest';
import {
    getXAIModelCapabilities,
    isReasoningModel,
    normalizeModelId,
    supportsReasoningEffort,
    toXAIReasoningEffort,
} from './model-capabilities.ts';

describe('getXAIModelCapabilities', () => {
    it('reports effort control for grok-4.3 aliases', () => {
        expect(getXAIModelCapabilities('grok-4.3')).toEqual({
            reasoning: {
                supported: true,
                supportedEfforts: [
                    'minimal',
                    'low',
                    'medium',
                    'high',
                    'max',
                ],
                restrictsSamplingParams: false,
            },
        });
        expect(getXAIModelCapabilities('grok-latest')).toEqual(
            getXAIModelCapabilities('grok-4.3')
        );
    });

    it('reports reasoning models without effort control', () => {
        expect(getXAIModelCapabilities('grok-4.20')).toEqual({
            reasoning: {
                supported: true,
                supportedEfforts: [],
                restrictsSamplingParams: false,
            },
        });
        expect(
            getXAIModelCapabilities('grok-4.20-multi-agent-latest')
        ).toEqual(getXAIModelCapabilities('grok-4.20'));
    });

    it('reports non-reasoning model aliases', () => {
        expect(
            getXAIModelCapabilities('grok-4.20-non-reasoning-latest')
        ).toEqual({
            reasoning: {
                supported: false,
                supportedEfforts: [],
                restrictsSamplingParams: false,
            },
        });
    });

    it('uses a conservative fallback for unknown models', () => {
        expect(getXAIModelCapabilities('grok-future')).toEqual({
            reasoning: {
                supported: false,
                supportedEfforts: [],
                restrictsSamplingParams: false,
            },
        });
    });
});

describe('normalizeModelId', () => {
    it('should strip date suffixes', () => {
        expect(normalizeModelId('grok-4.3-20260612')).toBe('grok-4.3');
    });

    it('should preserve model IDs without date suffix', () => {
        expect(normalizeModelId('grok-4.20-0309-non-reasoning')).toBe(
            'grok-4.20-0309-non-reasoning'
        );
    });

    it('normalizes case and whitespace before matching aliases', () => {
        expect(normalizeModelId('  GROK-LATEST  ')).toBe('grok-latest');
    });
});

describe('supportsReasoningEffort', () => {
    it('should return true for configurable reasoning aliases', () => {
        expect(supportsReasoningEffort('grok-4.3')).toBe(true);
        expect(supportsReasoningEffort('grok-4.3-latest')).toBe(true);
    });

    it('should return false for reasoning models without effort control', () => {
        expect(supportsReasoningEffort('grok-4.20-0309-reasoning')).toBe(false);
        expect(supportsReasoningEffort('grok-4.5')).toBe(false);
    });
});

describe('isReasoningModel', () => {
    it('should identify current reasoning model families', () => {
        expect(isReasoningModel('grok-4.3')).toBe(true);
        expect(isReasoningModel('grok-4.20-0309-reasoning')).toBe(true);
        expect(isReasoningModel('grok-4.20-multi-agent')).toBe(true);
        expect(isReasoningModel('grok-build-latest')).toBe(true);
    });

    it('should exclude non-reasoning variants', () => {
        expect(isReasoningModel('grok-4.20-0309-non-reasoning')).toBe(false);
    });
});

describe('toXAIReasoningEffort', () => {
    it.each([
        ['minimal', 'none'],
        ['low', 'low'],
        ['medium', 'medium'],
        ['high', 'high'],
        ['max', 'high'],
    ] as const)('should map %s to %s', (effort, expected) => {
        expect(toXAIReasoningEffort(effort)).toBe(expected);
    });
});
