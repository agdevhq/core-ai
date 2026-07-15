import {
    stripModelDateSuffix,
    type ModelCapabilities,
} from '@core-ai/core-ai';

export type KimiModelCapabilities = ModelCapabilities & {
    reasoning: ModelCapabilities['reasoning'] & {
        alwaysOn: boolean;
        supportsEffortControl: boolean;
    };
    sampling: {
        fixedTemperature: number;
        fixedTopP: number;
        fixedFrequencyPenalty: number;
        fixedPresencePenalty: number;
        fixedN: number;
    };
};

const K2_7_CODE_CAPABILITIES: KimiModelCapabilities = {
    reasoning: {
        supported: true,
        supportedEfforts: [],
        restrictsSamplingParams: true,
        alwaysOn: true,
        supportsEffortControl: false,
    },
    sampling: {
        fixedTemperature: 1.0,
        fixedTopP: 0.95,
        fixedFrequencyPenalty: 0.0,
        fixedPresencePenalty: 0.0,
        fixedN: 1,
    },
};

const MODEL_CAPABILITIES: Record<string, KimiModelCapabilities> = {
    'kimi-k2.7-code': K2_7_CODE_CAPABILITIES,
    'kimi-k2.7-code-highspeed': K2_7_CODE_CAPABILITIES,
};

export function getKimiModelCapabilities(modelId: string): KimiModelCapabilities {
    const normalizedModelId = normalizeModelId(modelId);
    return MODEL_CAPABILITIES[normalizedModelId] ?? K2_7_CODE_CAPABILITIES;
}

export function normalizeModelId(modelId: string): string {
    return stripModelDateSuffix(modelId);
}

export function isFixedSamplingModel(modelId: string): boolean {
    const normalizedModelId = normalizeModelId(modelId);
    return normalizedModelId in MODEL_CAPABILITIES;
}

export function supportsForcedToolChoice(modelId: string): boolean {
    const capabilities = getKimiModelCapabilities(modelId);
    return !capabilities.reasoning.alwaysOn;
}
