import { describe, expect, it } from 'vitest';
import { UNKNOWN_MODEL } from '@core-ai/core-ai';

import { KIMI_MODEL_CAPABILITIES } from './model-capabilities.ts';

describe('KIMI_MODEL_CAPABILITIES', () => {
    it('should define K2.7 Code capabilities', () => {
        const capabilities = KIMI_MODEL_CAPABILITIES['kimi-k2.7-code'];

        expect(KIMI_MODEL_CAPABILITIES['kimi-k2.7-code-highspeed']).toBe(
            capabilities
        );
        expect(capabilities.reasoning.mode).toBe('always-on');
        expect(capabilities.reasoning.supportedEfforts).toEqual([]);
        expect(capabilities.reasoning.restrictsSamplingParams).toBe(true);
        expect(capabilities.reasoning.supportedToolChoices).toEqual([
            'auto',
            'none',
        ]);
        expect(capabilities.modalities.imageInput).toEqual({
            supported: false,
            supportedSources: [],
        });
    });

    it('should define unrestricted capabilities for unknown models', () => {
        const capabilities = KIMI_MODEL_CAPABILITIES[UNKNOWN_MODEL];

        expect(capabilities.reasoning.mode).toBe('unsupported');
        expect(capabilities.reasoning.restrictsSamplingParams).toBe(false);
        expect(capabilities.reasoning.supportedToolChoices).toEqual([
            'auto',
            'none',
            'required',
            'tool',
        ]);
        expect(capabilities.modalities.imageInput.supported).toBe(true);
    });
});
