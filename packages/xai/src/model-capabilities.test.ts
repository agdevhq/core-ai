import { describe, expect, it } from 'vitest';
import {
    getXAIModelCapabilities,
    isReasoningModel,
    normalizeModelId,
    supportsReasoningEffort,
    toXAIReasoningEffort,
} from './model-capabilities.ts';

describe('getXAIModelCapabilities', () => {
    it('reports effort control for grok-4.3', () => {
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
    });

    it('reports non-reasoning models', () => {
        expect(
            getXAIModelCapabilities('grok-4.20-0309-non-reasoning')
        ).toEqual({
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
});

describe('supportsReasoningEffort', () => {
    it('should return true for grok-4.3', () => {
        expect(supportsReasoningEffort('grok-4.3')).toBe(true);
    });

    it('should return false for other models', () => {
        expect(supportsReasoningEffort('grok-4.20-0309-reasoning')).toBe(
            false
        );
    });
});

describe('isReasoningModel', () => {
    it('should identify grok-4.3 as a reasoning model', () => {
        expect(isReasoningModel('grok-4.3')).toBe(true);
    });

    it('should identify reasoning variants', () => {
        expect(isReasoningModel('grok-4.20-0309-reasoning')).toBe(true);
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
