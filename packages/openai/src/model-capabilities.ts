import {
    getRegisteredModelCapabilities,
    stripModelDateSuffix,
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

function createCapabilities(
    supportedEfforts: readonly ReasoningEffort[],
    restrictsSamplingParams: boolean,
    maxTokensParameter: OpenAIChatCompletionsCapabilities['maxTokensParameter'] = 'max_completion_tokens'
): OpenAIModelCapabilities {
    return {
        reasoning: {
            supported: true,
            supportedEfforts,
            restrictsSamplingParams,
        },
        chatCompletions: {
            maxTokensParameter,
        },
    };
}

const DEFAULT_CAPABILITIES = createCapabilities(STANDARD_EFFORTS, false);
const UNKNOWN_MODEL_CAPABILITIES = createCapabilities(
    STANDARD_EFFORTS,
    false,
    'max_tokens'
);
const SAMPLING_RESTRICTED_STANDARD_CAPABILITIES = createCapabilities(
    STANDARD_EFFORTS,
    true
);
const GPT_5_MAX_REASONING_CAPABILITIES = createCapabilities(MAX_EFFORTS, true);
const GPT_5_MINIMAL_REASONING_CAPABILITIES = createCapabilities(
    MINIMAL_EFFORTS,
    true
);
const GPT_5_PRO_REASONING_CAPABILITIES = createCapabilities(PRO_EFFORTS, true);
const GPT_5_HIGH_REASONING_CAPABILITIES = createCapabilities(HIGH_EFFORT, true);

function createNoReasoningCapabilities(
    maxTokensParameter: OpenAIChatCompletionsCapabilities['maxTokensParameter']
): OpenAIModelCapabilities {
    return {
        reasoning: {
            supported: false,
            supportedEfforts: [],
            restrictsSamplingParams: false,
        },
        chatCompletions: {
            maxTokensParameter,
        },
    };
}

const NO_REASONING_CAPABILITIES = createNoReasoningCapabilities('max_tokens');
const NO_REASONING_EFFORT_CAPABILITIES = createNoReasoningCapabilities(
    'max_completion_tokens'
);

const O_SERIES_MAX_REASONING_CAPABILITIES = createCapabilities(
    MAX_EFFORTS,
    false
);

export const OPENAI_MODEL_CAPABILITIES = {
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
    'o3-mini': DEFAULT_CAPABILITIES,
    'o4-mini': DEFAULT_CAPABILITIES,
    o1: DEFAULT_CAPABILITIES,
    'o1-mini': NO_REASONING_EFFORT_CAPABILITIES,
    'gpt-4.1': NO_REASONING_CAPABILITIES,
    'gpt-4.1-mini': NO_REASONING_CAPABILITIES,
    'gpt-4.1-nano': NO_REASONING_CAPABILITIES,
    'gpt-4o': NO_REASONING_CAPABILITIES,
    'gpt-4o-mini': NO_REASONING_CAPABILITIES,
    'gpt-4-turbo': NO_REASONING_CAPABILITIES,
    'gpt-3.5-turbo': NO_REASONING_CAPABILITIES,
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

export function normalizeModelId(modelId: string): string {
    return stripModelDateSuffix(modelId);
}

export function toOpenAIReasoningEffort(
    effort: ReasoningEffort
): 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' {
    return OPENAI_REASONING_EFFORT_MAP[effort];
}
