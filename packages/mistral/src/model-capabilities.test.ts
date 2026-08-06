import { describe, expect, it } from 'vitest';
import {
    getMistralModelCapabilities,
    normalizeModelId,
} from './model-capabilities.js';

describe('normalizeModelId', () => {
    it('should strip the latest alias', () => {
        expect(normalizeModelId('mistral-large-latest')).toBe('mistral-large');
    });

    it('should strip Mistral version suffixes', () => {
        expect(normalizeModelId('pixtral-12b-2409')).toBe('pixtral-12b');
        expect(normalizeModelId('mistral-small-2506')).toBe('mistral-small');
    });

    it('should preserve model IDs without a version suffix', () => {
        expect(normalizeModelId('open-mistral-7b')).toBe('open-mistral-7b');
    });
});

describe('getMistralModelCapabilities', () => {
    it('should report reasoning effort as unsupported', () => {
        expect(
            getMistralModelCapabilities('mistral-large-latest').reasoning
        ).toEqual({
            mode: 'unsupported',
            supportedEfforts: [],
            restrictsSamplingParams: false,
            supportedToolChoices: ['auto', 'none', 'required', 'tool'],
        });
    });

    it.each([
        'mistral-large-latest',
        'mistral-large-2512',
        'mistral-medium-latest',
        'mistral-medium-2508',
        'mistral-small-2503',
        'mistral-small-2506',
        'pixtral-large-latest',
        'pixtral-12b-2409',
        'magistral-medium-2509',
        'magistral-small-2509',
        'ministral-3b-2512',
        'ministral-8b-latest',
        'ministral-14b-2512',
    ])('should report image input as supported for %s', (modelId) => {
        expect(getMistralModelCapabilities(modelId).modalities.imageInput).toEqual({
            supported: true,
            supportedSources: ['base64', 'url'],
        });
    });

    it.each([
        'codestral-latest',
        'devstral-small-latest',
        'devstral-medium-2507',
        'open-mistral-7b',
        'open-mistral-nemo',
        'open-mixtral-8x22b',
    ])('should report image input as unsupported for %s', (modelId) => {
        expect(getMistralModelCapabilities(modelId).modalities.imageInput).toEqual({
            supported: false,
            supportedSources: [],
        });
    });

    it.each([
        // Vision arrived with Mistral Large 3 (-2512).
        'mistral-large-2411',
        // Vision arrived with Mistral Small 3.1 (-2503).
        'mistral-small-2409',
        'mistral-small-2501',
        // Vision arrived with Magistral 1.2 (-2509).
        'magistral-small-2506',
        'magistral-medium-2507',
        // Vision arrived with Ministral 3 (-2512).
        'ministral-8b-2410',
    ])(
        'should report image input as unsupported for the pre-vision %s',
        (modelId) => {
            expect(
                getMistralModelCapabilities(modelId).modalities.imageInput.supported
            ).toBe(false);
        }
    );

    it('should prefer an exact version over the family entry', () => {
        expect(
            getMistralModelCapabilities('ministral-8b-2410').modalities.imageInput
                .supported
        ).toBe(false);
        expect(
            getMistralModelCapabilities('ministral-8b-2512').modalities.imageInput
                .supported
        ).toBe(true);
    });

    it('should treat unknown models as image capable', () => {
        expect(
            getMistralModelCapabilities('self-hosted-model').modalities.imageInput
                .supported
        ).toBe(true);
    });
});
