import { describe, expect, it } from 'vitest';
import {
    getKimiModelCapabilities,
    isFixedSamplingModel,
    normalizeModelId,
    supportsForcedToolChoice,
} from './model-capabilities.ts';

describe('normalizeModelId', () => {
    it('should strip date suffixes', () => {
        expect(normalizeModelId('kimi-k2.7-code-20260612')).toBe(
            'kimi-k2.7-code'
        );
    });

    it('should preserve model IDs without date suffix', () => {
        expect(normalizeModelId('kimi-k2.7-code-highspeed')).toBe(
            'kimi-k2.7-code-highspeed'
        );
    });
});

describe('getKimiModelCapabilities', () => {
    it.each(['kimi-k2.7-code', 'kimi-k2.7-code-highspeed'])(
        'should return always-on reasoning for %s',
        (modelId) => {
            const capabilities = getKimiModelCapabilities(modelId);
            expect(capabilities.reasoning.alwaysOn).toBe(true);
            expect(capabilities.reasoning.supportsEffortControl).toBe(false);
            expect(capabilities.sampling.fixedTemperature).toBe(1.0);
            expect(capabilities.sampling.fixedTopP).toBe(0.95);
        }
    );
});

describe('isFixedSamplingModel', () => {
    it('should identify K2.7 Code models', () => {
        expect(isFixedSamplingModel('kimi-k2.7-code')).toBe(true);
        expect(isFixedSamplingModel('kimi-k2.7-code-highspeed')).toBe(true);
    });

    it('should return false for unknown models', () => {
        expect(isFixedSamplingModel('unknown-model')).toBe(false);
    });
});

describe('supportsForcedToolChoice', () => {
    it.each(['kimi-k2.7-code', 'kimi-k2.7-code-highspeed'])(
        'should return false for always-on thinking model %s',
        (modelId) => {
            expect(supportsForcedToolChoice(modelId)).toBe(false);
        }
    );
});
