import {
    getRegisteredModelCapabilities,
    MULTIMODAL_INPUT_MODALITIES,
    SUPPORTED_TOOL_SCHEMA_STRICTNESS,
    stripModelDateSuffix,
    TEXT_ONLY_MODALITIES,
    UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
    UNKNOWN_MODEL,
    type ModelCapabilities,
    type ModelCapabilitiesRegistry,
    type ReasoningEffort,
} from '@core-ai/core-ai';

export type OpenAIChatCompletionsCapabilities = {
    maxTokensParameter: 'max_tokens' | 'max_completion_tokens';
};

export type OpenAIModelCapabilities = ModelCapabilities & {
    chatCompletions: OpenAIChatCompletionsCapabilities;
};

const STANDARD_EFFORTS = [
    'low',
    'medium',
    'high',
] as const satisfies readonly ReasoningEffort[];
const MAX_EFFORTS = [
    'low',
    'medium',
    'high',
    'max',
] as const satisfies readonly ReasoningEffort[];
const MINIMAL_EFFORTS = [
    'minimal',
    'low',
    'medium',
    'high',
] as const satisfies readonly ReasoningEffort[];
const PRO_EFFORTS = [
    'medium',
    'high',
    'max',
] as const satisfies readonly ReasoningEffort[];
const HIGH_EFFORT = ['high'] as const satisfies readonly ReasoningEffort[];

const OPENAI_AUDIO_INPUT_MODALITIES = {
    input: ['text', 'audio'],
    output: ['text'],
} as const satisfies ModelCapabilities['modalities'];

type CapabilitiesConfig = {
    supportedEfforts: readonly ReasoningEffort[];
    restrictsSamplingParams: boolean;
    maxTokensParameter?: OpenAIChatCompletionsCapabilities['maxTokensParameter'];
    modalities?: ModelCapabilities['modalities'];
    strictToolSchemas?: ModelCapabilities['tools']['strictSchemas'];
};

function createCapabilities({
    supportedEfforts,
    restrictsSamplingParams,
    maxTokensParameter = 'max_completion_tokens',
    modalities = MULTIMODAL_INPUT_MODALITIES,
    strictToolSchemas = SUPPORTED_TOOL_SCHEMA_STRICTNESS,
}: CapabilitiesConfig): OpenAIModelCapabilities {
    return {
        reasoning: {
            mode: 'optional',
            supportedEfforts,
            restrictsSamplingParams,
            supportedToolChoices: ['auto', 'none', 'required', 'tool'],
        },
        modalities,
        tools: {
            strictSchemas: strictToolSchemas,
        },
        chatCompletions: {
            maxTokensParameter,
        },
    };
}

const DEFAULT_CAPABILITIES = createCapabilities({
    supportedEfforts: STANDARD_EFFORTS,
    restrictsSamplingParams: false,
});
// Unknown model ids (fine-tunes, brand-new releases) keep strict schemas
// supported: strict is per-tool opt-in, so an explicit `strict: true` is
// forwarded optimistically and the API rejects it if genuinely unsupported.
const UNKNOWN_MODEL_CAPABILITIES = createCapabilities({
    supportedEfforts: STANDARD_EFFORTS,
    restrictsSamplingParams: false,
    maxTokensParameter: 'max_tokens',
});
const SAMPLING_RESTRICTED_STANDARD_CAPABILITIES = createCapabilities({
    supportedEfforts: STANDARD_EFFORTS,
    restrictsSamplingParams: true,
});
const GPT_5_MAX_REASONING_CAPABILITIES = createCapabilities({
    supportedEfforts: MAX_EFFORTS,
    restrictsSamplingParams: true,
});
const GPT_5_MINIMAL_REASONING_CAPABILITIES = createCapabilities({
    supportedEfforts: MINIMAL_EFFORTS,
    restrictsSamplingParams: true,
});
const GPT_5_PRO_REASONING_CAPABILITIES = createCapabilities({
    supportedEfforts: PRO_EFFORTS,
    restrictsSamplingParams: true,
});
const GPT_5_HIGH_REASONING_CAPABILITIES = createCapabilities({
    supportedEfforts: HIGH_EFFORT,
    restrictsSamplingParams: true,
});

type NoReasoningCapabilitiesConfig = {
    maxTokensParameter: OpenAIChatCompletionsCapabilities['maxTokensParameter'];
    modalities?: ModelCapabilities['modalities'];
    strictToolSchemas?: ModelCapabilities['tools']['strictSchemas'];
};

function createNoReasoningCapabilities({
    maxTokensParameter,
    modalities = MULTIMODAL_INPUT_MODALITIES,
    strictToolSchemas = SUPPORTED_TOOL_SCHEMA_STRICTNESS,
}: NoReasoningCapabilitiesConfig): OpenAIModelCapabilities {
    return {
        reasoning: {
            mode: 'unsupported',
            supportedEfforts: [],
            restrictsSamplingParams: false,
            supportedToolChoices: ['auto', 'none', 'required', 'tool'],
        },
        modalities,
        tools: {
            strictSchemas: strictToolSchemas,
        },
        chatCompletions: {
            maxTokensParameter,
        },
    };
}

const NO_REASONING_CAPABILITIES = createNoReasoningCapabilities({
    maxTokensParameter: 'max_tokens',
});
const NO_REASONING_TEXT_ONLY_CAPABILITIES = createNoReasoningCapabilities({
    maxTokensParameter: 'max_tokens',
    modalities: TEXT_ONLY_MODALITIES,
});
const NO_REASONING_EFFORT_TEXT_ONLY_CAPABILITIES =
    createNoReasoningCapabilities({
        maxTokensParameter: 'max_completion_tokens',
        modalities: TEXT_ONLY_MODALITIES,
    });
const AUDIO_CAPABILITIES = createNoReasoningCapabilities({
    maxTokensParameter: 'max_completion_tokens',
    modalities: OPENAI_AUDIO_INPUT_MODALITIES,
    strictToolSchemas: UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
});
const GPT_4O_AUDIO_CAPABILITIES = createNoReasoningCapabilities({
    maxTokensParameter: 'max_tokens',
    modalities: OPENAI_AUDIO_INPUT_MODALITIES,
    strictToolSchemas: UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
});

const O_SERIES_MAX_REASONING_CAPABILITIES = createCapabilities({
    supportedEfforts: MAX_EFFORTS,
    restrictsSamplingParams: false,
});
const O_SERIES_TEXT_ONLY_CAPABILITIES = createCapabilities({
    supportedEfforts: STANDARD_EFFORTS,
    restrictsSamplingParams: false,
    modalities: TEXT_ONLY_MODALITIES,
});

export const OPENAI_MODEL_CAPABILITIES = {
    'gpt-4o-2024-05-13': NO_REASONING_CAPABILITIES,
    'gpt-5.6-sol': GPT_5_MAX_REASONING_CAPABILITIES,
    'gpt-5.6-terra': SAMPLING_RESTRICTED_STANDARD_CAPABILITIES,
    'gpt-5.6-luna': GPT_5_MINIMAL_REASONING_CAPABILITIES,
    'gpt-5.5': GPT_5_MAX_REASONING_CAPABILITIES,
    'gpt-5.5-pro': GPT_5_PRO_REASONING_CAPABILITIES,
    'gpt-5.4': GPT_5_MAX_REASONING_CAPABILITIES,
    'gpt-5.4-pro': GPT_5_PRO_REASONING_CAPABILITIES,
    'gpt-5.4-mini': GPT_5_MAX_REASONING_CAPABILITIES,
    'gpt-5.4-nano': GPT_5_MAX_REASONING_CAPABILITIES,
    'gpt-5.3-codex': GPT_5_MAX_REASONING_CAPABILITIES,
    'gpt-5.2': GPT_5_MAX_REASONING_CAPABILITIES,
    'gpt-5.2-codex': GPT_5_MAX_REASONING_CAPABILITIES,
    'gpt-5.2-pro': GPT_5_MAX_REASONING_CAPABILITIES,
    'gpt-5.1-codex': GPT_5_MAX_REASONING_CAPABILITIES,
    'gpt-5.1-codex-max': GPT_5_MAX_REASONING_CAPABILITIES,
    'gpt-5.1-codex-mini': GPT_5_MAX_REASONING_CAPABILITIES,
    'gpt-5.1': SAMPLING_RESTRICTED_STANDARD_CAPABILITIES,
    'gpt-5': GPT_5_MINIMAL_REASONING_CAPABILITIES,
    'gpt-5-mini': GPT_5_MINIMAL_REASONING_CAPABILITIES,
    'gpt-5-nano': GPT_5_MINIMAL_REASONING_CAPABILITIES,
    'gpt-5-pro': GPT_5_HIGH_REASONING_CAPABILITIES,
    'gpt-5-codex': GPT_5_MAX_REASONING_CAPABILITIES,
    'o3-pro': O_SERIES_MAX_REASONING_CAPABILITIES,
    o3: DEFAULT_CAPABILITIES,
    'o3-mini': O_SERIES_TEXT_ONLY_CAPABILITIES,
    'o4-mini': DEFAULT_CAPABILITIES,
    o1: DEFAULT_CAPABILITIES,
    'o1-mini': NO_REASONING_EFFORT_TEXT_ONLY_CAPABILITIES,
    'gpt-4.1': NO_REASONING_CAPABILITIES,
    'gpt-4.1-mini': NO_REASONING_CAPABILITIES,
    'gpt-4.1-nano': NO_REASONING_CAPABILITIES,
    'gpt-4o': NO_REASONING_CAPABILITIES,
    'gpt-4o-mini': NO_REASONING_CAPABILITIES,
    'gpt-4-turbo': NO_REASONING_CAPABILITIES,
    'gpt-3.5-turbo': NO_REASONING_TEXT_ONLY_CAPABILITIES,
    'gpt-audio-1.5': AUDIO_CAPABILITIES,
    'gpt-audio': AUDIO_CAPABILITIES,
    'gpt-audio-mini': AUDIO_CAPABILITIES,
    'gpt-4o-audio-preview': GPT_4O_AUDIO_CAPABILITIES,
    'gpt-4o-mini-audio-preview': GPT_4O_AUDIO_CAPABILITIES,
    [UNKNOWN_MODEL]: UNKNOWN_MODEL_CAPABILITIES,
} as const satisfies ModelCapabilitiesRegistry<OpenAIModelCapabilities>;

const OPENAI_REASONING_EFFORT_MAP: Record<
    ReasoningEffort,
    'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
> = {
    minimal: 'minimal',
    low: 'low',
    medium: 'medium',
    high: 'high',
    max: 'xhigh',
};

export function getOpenAIModelCapabilities(
    modelId: string
): OpenAIModelCapabilities {
    return (
        getRegisteredModelCapabilities(OPENAI_MODEL_CAPABILITIES, modelId) ??
        UNKNOWN_MODEL_CAPABILITIES
    );
}

export function toOpenAIResponsesCapabilities(
    capabilities: ModelCapabilities,
    modelId: string
): ModelCapabilities {
    const restrictStrictTools = !doesResponsesApiSupportStrictTools(modelId);
    const removeAudioInput = capabilities.modalities.input.includes('audio');

    if (!restrictStrictTools && !removeAudioInput) {
        return capabilities;
    }

    return {
        ...capabilities,
        ...(restrictStrictTools
            ? {
                  tools: {
                      strictSchemas: UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
                  },
              }
            : {}),
        ...(removeAudioInput
            ? {
                  modalities: {
                      input: capabilities.modalities.input.filter(
                          (modality) => modality !== 'audio'
                      ),
                      output: capabilities.modalities.output,
                  },
              }
            : {}),
    };
}

function doesResponsesApiSupportStrictTools(modelId: string): boolean {
    if (modelId === 'gpt-4o-2024-05-13') {
        return false;
    }

    const normalizedModelId = normalizeModelId(modelId);
    return (
        normalizedModelId !== 'gpt-4-turbo' &&
        normalizedModelId !== 'gpt-3.5-turbo'
    );
}

export function normalizeModelId(modelId: string): string {
    return stripModelDateSuffix(modelId);
}

export function toOpenAIReasoningEffort(
    effort: ReasoningEffort
): 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' {
    return OPENAI_REASONING_EFFORT_MAP[effort];
}
