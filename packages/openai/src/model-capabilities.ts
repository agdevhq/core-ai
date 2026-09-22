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

/**
 * Chat Completions function-calling support for a model.
 *
 * `none-only` models accept function tools only when `reasoning_effort` is
 * `none`. `unsupported` models accept tools on the Responses API only.
 */
export type OpenAIChatCompletionsFunctionCalling =
    | 'supported'
    | 'none-only'
    | 'unsupported';

export type OpenAIChatCompletionsCapabilities = {
    maxTokensParameter: 'max_tokens' | 'max_completion_tokens';
    functionCalling: OpenAIChatCompletionsFunctionCalling;
};

export type OpenAIModelCapabilities = ModelCapabilities & {
    chatCompletions: OpenAIChatCompletionsCapabilities;
    /**
     * When true, core `max` is sent as OpenAI `max`. Otherwise it is sent as
     * `xhigh`, which is the top effort on earlier reasoning models.
     */
    nativeMaxEffort: boolean;
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
    reasoningMode?: 'optional' | 'always-on';
    functionCalling?: OpenAIChatCompletionsFunctionCalling;
    nativeMaxEffort?: boolean;
};

function createCapabilities({
    supportedEfforts,
    restrictsSamplingParams,
    maxTokensParameter = 'max_completion_tokens',
    modalities = MULTIMODAL_INPUT_MODALITIES,
    strictToolSchemas = SUPPORTED_TOOL_SCHEMA_STRICTNESS,
    reasoningMode = 'optional',
    functionCalling = 'supported',
    nativeMaxEffort = false,
}: CapabilitiesConfig): OpenAIModelCapabilities {
    return {
        reasoning: {
            mode: reasoningMode,
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
            functionCalling,
        },
        nativeMaxEffort,
    };
}

const DEFAULT_CAPABILITIES = createCapabilities({
    supportedEfforts: STANDARD_EFFORTS,
    restrictsSamplingParams: false,
});
// Unknown model ids (brand-new releases, fine-tunes of unregistered bases)
// keep strict schemas supported: strict is per-tool opt-in, so an explicit
// `strict: true` is forwarded optimistically and the API rejects it if
// genuinely unsupported.
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
// GPT-6 reasons unless the request sets effort to `none`. Astra has no `none`
// and rejects Chat Completions tool calls. Sol and Luna accept Chat Completions
// function calls only at effort `none`.
const GPT_6_EFFORTS = [
    'low',
    'medium',
    'high',
    'max',
] as const satisfies readonly ReasoningEffort[];
const GPT_6_ASTRA_CAPABILITIES = createCapabilities({
    supportedEfforts: GPT_6_EFFORTS,
    restrictsSamplingParams: true,
    reasoningMode: 'always-on',
    functionCalling: 'unsupported',
    nativeMaxEffort: true,
});
const GPT_6_SOL_LUNA_CAPABILITIES = createCapabilities({
    supportedEfforts: GPT_6_EFFORTS,
    restrictsSamplingParams: true,
    reasoningMode: 'always-on',
    functionCalling: 'none-only',
    nativeMaxEffort: true,
});

type NoReasoningCapabilitiesConfig = {
    maxTokensParameter: OpenAIChatCompletionsCapabilities['maxTokensParameter'];
    modalities?: ModelCapabilities['modalities'];
    strictToolSchemas?: ModelCapabilities['tools']['strictSchemas'];
    functionCalling?: OpenAIChatCompletionsFunctionCalling;
};

function createNoReasoningCapabilities({
    maxTokensParameter,
    modalities = MULTIMODAL_INPUT_MODALITIES,
    strictToolSchemas = SUPPORTED_TOOL_SCHEMA_STRICTNESS,
    functionCalling = 'supported',
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
            functionCalling,
        },
        nativeMaxEffort: false,
    };
}

const NO_REASONING_CAPABILITIES = createNoReasoningCapabilities({
    maxTokensParameter: 'max_tokens',
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

// Models that predate Structured Outputs: OpenAI rejects strict function
// tools on them through both the Responses and Chat Completions APIs.
const LEGACY_NO_STRICT_TOOLS_CAPABILITIES = createNoReasoningCapabilities({
    maxTokensParameter: 'max_tokens',
    strictToolSchemas: UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
});
const LEGACY_NO_STRICT_TOOLS_TEXT_ONLY_CAPABILITIES =
    createNoReasoningCapabilities({
        maxTokensParameter: 'max_tokens',
        modalities: TEXT_ONLY_MODALITIES,
        strictToolSchemas: UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
    });

export const OPENAI_MODEL_CAPABILITIES = {
    'gpt-4o-2024-05-13': LEGACY_NO_STRICT_TOOLS_CAPABILITIES,
    'gpt-6-astra': GPT_6_ASTRA_CAPABILITIES,
    'gpt-6-sol': GPT_6_SOL_LUNA_CAPABILITIES,
    'gpt-6-luna': GPT_6_SOL_LUNA_CAPABILITIES,
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
    'gpt-4-turbo': LEGACY_NO_STRICT_TOOLS_CAPABILITIES,
    'gpt-3.5-turbo': LEGACY_NO_STRICT_TOOLS_TEXT_ONLY_CAPABILITIES,
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

type OpenAIReasoningEffort =
    | 'none'
    | 'minimal'
    | 'low'
    | 'medium'
    | 'high'
    | 'xhigh'
    | 'max';

export function getOpenAIModelCapabilities(
    modelId: string
): OpenAIModelCapabilities {
    return (
        getRegisteredModelCapabilities(
            OPENAI_MODEL_CAPABILITIES,
            getFineTuneBaseModelId(modelId) ?? modelId
        ) ?? UNKNOWN_MODEL_CAPABILITIES
    );
}

const FINE_TUNE_MODEL_ID_PATTERN = /^ft:([^:]+):/;

/**
 * Fine-tuned models are named `ft:<base-model>:<org>:<suffix>:<id>` and share
 * the base model's capabilities, including its strict tool schema support.
 */
export function getFineTuneBaseModelId(modelId: string): string | undefined {
    return FINE_TUNE_MODEL_ID_PATTERN.exec(modelId)?.[1];
}

export function toOpenAIResponsesCapabilities(
    capabilities: ModelCapabilities
): ModelCapabilities {
    if (!capabilities.modalities.input.includes('audio')) {
        return capabilities;
    }

    return {
        ...capabilities,
        modalities: {
            input: capabilities.modalities.input.filter(
                (modality) => modality !== 'audio'
            ),
            output: capabilities.modalities.output,
        },
    };
}

export function normalizeModelId(modelId: string): string {
    return stripModelDateSuffix(modelId);
}

export function toOpenAIReasoningEffort(
    effort: ReasoningEffort,
    modelId?: string
): Exclude<OpenAIReasoningEffort, 'none'> {
    if (
        effort === 'max' &&
        modelId !== undefined &&
        getOpenAIModelCapabilities(modelId).nativeMaxEffort
    ) {
        return 'max';
    }

    return OPENAI_REASONING_EFFORT_MAP[effort];
}
