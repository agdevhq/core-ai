import { describe, expect, it } from 'vitest';
import {
    getRegisteredModelCapabilities,
    UNKNOWN_MODEL,
} from '@core-ai/core-ai';

import { XAI_MODEL_CAPABILITIES } from './model-capabilities.ts';

function capabilitiesFor(modelId: string) {
    return getRegisteredModelCapabilities(XAI_MODEL_CAPABILITIES, modelId);
}

describe('XAI_MODEL_CAPABILITIES', () => {
    it.each(['grok-4.7', 'grok-4.6', 'grok-4.5'])(
        'should treat %s as always-on reasoning with configurable effort',
        (modelId) => {
            expect(capabilitiesFor(modelId)?.reasoning).toMatchObject({
                mode: 'always-on',
                supportedEfforts: ['low', 'medium', 'high', 'max'],
            });
        }
    );

    it('should treat grok-4.3 reasoning as optional', () => {
        expect(capabilitiesFor('grok-4.3')?.reasoning).toMatchObject({
            mode: 'optional',
            supportedEfforts: ['low', 'medium', 'high', 'max'],
        });
    });

    it.each([
        ['grok-4.20-0309-reasoning', 'always-on'],
        ['grok-4.20-multi-agent-0309', 'always-on'],
        ['grok-build-0.1', 'always-on'],
        ['grok-4.20-0309-non-reasoning', 'unsupported'],
    ] as const)(
        'should never send a reasoning effort to %s',
        (modelId, mode) => {
            expect(capabilitiesFor(modelId)?.reasoning).toMatchObject({
                mode,
                supportedEfforts: [],
            });
        }
    );

    it.each([
        ['grok-4.5-latest', 'grok-4.5'],
        ['grok-build-latest', 'grok-4.5'],
        ['grok-4.3-latest', 'grok-4.3'],
        ['grok-4.20', 'grok-4.20-0309-reasoning'],
        ['grok-4.20-non-reasoning', 'grok-4.20-0309-non-reasoning'],
        ['grok-4.20-multi-agent', 'grok-4.20-multi-agent-0309'],
        ['grok-code-fast-1', 'grok-build-0.1'],
    ])('should resolve alias %s like %s', (alias, modelId) => {
        expect(capabilitiesFor(alias)).toBe(capabilitiesFor(modelId));
    });

    it('should accept text and image input and strict tools on every model', () => {
        for (const capabilities of Object.values(XAI_MODEL_CAPABILITIES)) {
            expect(capabilities.modalities).toEqual({
                input: ['text', 'image'],
                output: ['text'],
            });
            expect(capabilities.tools.strictSchemas).toEqual({
                supported: true,
            });
        }
    });

    it('should fall back to optional reasoning for unknown models', () => {
        expect(capabilitiesFor('grok-99')).toBe(
            XAI_MODEL_CAPABILITIES[UNKNOWN_MODEL]
        );
        expect(capabilitiesFor('grok-99')?.reasoning.mode).toBe('optional');
    });
});
