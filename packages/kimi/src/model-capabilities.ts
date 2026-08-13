import {
    MULTIMODAL_INPUT_MODALITIES,
    SUPPORTED_TOOL_SCHEMA_STRICTNESS,
    TEXT_ONLY_MODALITIES,
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
    modalities: MULTIMODAL_INPUT_MODALITIES,
    tools: {
        strictSchemas: SUPPORTED_TOOL_SCHEMA_STRICTNESS,
    },
};

const K2_7_CODE_CAPABILITIES: ModelCapabilities = {
    reasoning: {
        mode: 'always-on',
        supportedEfforts: [],
        restrictsSamplingParams: true,
        supportedToolChoices: ['auto', 'none'],
    },
    modalities: TEXT_ONLY_MODALITIES,
    tools: {
        strictSchemas: SUPPORTED_TOOL_SCHEMA_STRICTNESS,
    },
};

export const KIMI_MODEL_CAPABILITIES = {
    [UNKNOWN_MODEL]: UNKNOWN_MODEL_CAPABILITIES,
    'kimi-k2.7-code': K2_7_CODE_CAPABILITIES,
    'kimi-k2.7-code-highspeed': K2_7_CODE_CAPABILITIES,
} as const satisfies ModelCapabilitiesRegistry;
