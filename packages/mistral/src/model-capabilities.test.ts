import { describe, expect, it } from 'vitest';
import { getMistralModelCapabilities } from './model-capabilities.js';

describe('getMistralModelCapabilities', () => {
    it('should report reasoning effort as unsupported', () => {
        expect(getMistralModelCapabilities('mistral-large-latest')).toEqual({
            reasoning: {
                mode: 'unsupported',
                supportedEfforts: [],
                restrictsSamplingParams: false,
                supportedToolChoices: ['auto', 'none', 'required', 'tool'],
            },
        });
    });
});
