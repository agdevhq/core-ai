import {
    UNKNOWN_MODEL,
    type ModelCapabilities,
    type ModelCapabilitiesRegistry,
} from '@core-ai/core-ai';

export type KimiModelCapabilities = ModelCapabilities & {
    reasoning: ModelCapabilities['reasoning'] & {
        alwaysOn: boolean;
    };
    sampling?: {
        fixedTemperature: number;
        fixedTopP: number;
    };
};

const UNKNOWN_MODEL_CAPABILITIES: KimiModelCapabilities = {
    reasoning: {
        supported: true,
        supportedEfforts: [],
        restrictsSamplingParams: false,
        alwaysOn: false,
    },
};

const K2_7_CODE_CAPABILITIES: KimiModelCapabilities = {
    reasoning: {
        supported: true,
        supportedEfforts: [],
        restrictsSamplingParams: true,
        alwaysOn: true,
    },
    sampling: {
        fixedTemperature: 1.0,
        fixedTopP: 0.95,
    },
};

export const KIMI_MODEL_CAPABILITIES = {
    [UNKNOWN_MODEL]: UNKNOWN_MODEL_CAPABILITIES,
    'kimi-k2.7-code': K2_7_CODE_CAPABILITIES,
    'kimi-k2.7-code-highspeed': K2_7_CODE_CAPABILITIES,
} as const satisfies ModelCapabilitiesRegistry<KimiModelCapabilities>;
