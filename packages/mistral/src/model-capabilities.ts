import type { ModelCapabilities } from '@core-ai/core-ai';

export type MistralModelCapabilities = ModelCapabilities;

const NO_REASONING_CAPABILITIES: MistralModelCapabilities = {
    reasoning: {
        supported: false,
        supportedEfforts: [],
        restrictsSamplingParams: false,
    },
};

export function getMistralModelCapabilities(
    _modelId: string
): MistralModelCapabilities {
    return NO_REASONING_CAPABILITIES;
}
