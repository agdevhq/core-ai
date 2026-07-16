import type { ModelCapabilities } from '@core-ai/core-ai';

export type MistralModelCapabilities = ModelCapabilities;

const NO_REASONING_CAPABILITIES: MistralModelCapabilities = {
    reasoning: {
        mode: 'unsupported',
        supportedEfforts: [],
        restrictsSamplingParams: false,
        supportedToolChoices: ['auto', 'none', 'required', 'tool'],
    },
};

export function getMistralModelCapabilities(
    _modelId: string
): MistralModelCapabilities {
    return NO_REASONING_CAPABILITIES;
}
