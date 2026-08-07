import { describe, expect, it } from 'vitest';
import {
    clampReasoningEffort,
    MULTIMODAL_INPUT_MODALITIES,
    supportsInputModality,
    supportsOutputModality,
    TEXT_ONLY_MODALITIES,
} from './model-capabilities.ts';
import type { ModelCapabilities } from './types.ts';

describe('clampReasoningEffort', () => {
    it('returns the effort when it is already supported', () => {
        expect(clampReasoningEffort('medium', ['low', 'medium', 'high'])).toBe(
            'medium'
        );
    });

    it('returns the original effort when the supported list is empty', () => {
        expect(clampReasoningEffort('high', [])).toBe('high');
    });

    it('clamps to the nearest supported effort', () => {
        expect(clampReasoningEffort('minimal', ['low', 'medium', 'high'])).toBe(
            'low'
        );
        expect(clampReasoningEffort('max', ['low', 'medium', 'high'])).toBe(
            'high'
        );
        expect(clampReasoningEffort('medium', ['high'])).toBe('high');
    });
});

describe('modality helpers', () => {
    const reasoning: ModelCapabilities['reasoning'] = {
        mode: 'unsupported',
        supportedEfforts: [],
        restrictsSamplingParams: false,
        supportedToolChoices: ['auto', 'none', 'required', 'tool'],
    };

    it('reports image and file input for MULTIMODAL_INPUT_MODALITIES', () => {
        const capabilities: ModelCapabilities = {
            reasoning,
            modalities: MULTIMODAL_INPUT_MODALITIES,
        };

        expect(supportsInputModality(capabilities, 'text')).toBe(true);
        expect(supportsInputModality(capabilities, 'image')).toBe(true);
        expect(supportsInputModality(capabilities, 'file')).toBe(true);
        expect(supportsInputModality(capabilities, 'audio')).toBe(false);
        expect(supportsOutputModality(capabilities, 'text')).toBe(true);
        expect(supportsOutputModality(capabilities, 'image')).toBe(false);
    });

    it('reports text-only for TEXT_ONLY_MODALITIES', () => {
        const capabilities: ModelCapabilities = {
            reasoning,
            modalities: TEXT_ONLY_MODALITIES,
        };

        expect(supportsInputModality(capabilities, 'image')).toBe(false);
        expect(supportsInputModality(capabilities, 'file')).toBe(false);
        expect(supportsOutputModality(capabilities, 'text')).toBe(true);
    });
});
