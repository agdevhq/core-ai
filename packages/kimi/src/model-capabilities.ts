import {
    UNKNOWN_MODEL,
    type ModelCapabilities,
    type ModelCapabilitiesRegistry,
} from '@core-ai/core-ai';

const UNKNOWN_MODEL_CAPABILITIES: ModelCapabilities = {
    reasoning: {
        mode: 'unsupported',
        supportedEfforts: [],
        restrictsSamplingParams: false,
        supportedToolChoices: ['auto', 'none', 'required', 'tool'],
    },
};

const K2_7_CODE_CAPABILITIES: ModelCapabilities = {
    reasoning: {
        mode: 'always-on',
        supportedEfforts: [],
        restrictsSamplingParams: true,
        supportedToolChoices: ['auto', 'none'],
    },
};

export const KIMI_MODEL_CAPABILITIES = {
    [UNKNOWN_MODEL]: UNKNOWN_MODEL_CAPABILITIES,
    'kimi-k2.7-code': K2_7_CODE_CAPABILITIES,
    'kimi-k2.7-code-highspeed': K2_7_CODE_CAPABILITIES,
} as const satisfies ModelCapabilitiesRegistry;
