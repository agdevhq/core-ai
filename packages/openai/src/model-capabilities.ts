import { stripModelDateSuffix, type ReasoningEffort } from '@core-ai/core-ai';

export type OpenAIModelCapabilities = {
    reasoning: {
        supportsEffort: boolean;
        supportedRange: readonly ReasoningEffort[];
        restrictsSamplingParams: boolean;
    };
};

const DEFAULT_CAPABILITIES: OpenAIModelCapabilities = {
    reasoning: {
        supportsEffort: true,
        supportedRange: ['low', 'medium', 'high'],
        restrictsSamplingParams: false,
    },
};

const GPT_5_MAX_REASONING_CAPABILITIES: OpenAIModelCapabilities = {
    reasoning: {
        supportsEffort: true,
        supportedRange: ['low', 'medium', 'high', 'max'],
        restrictsSamplingParams: true,
    },
};

const GPT_5_MINIMAL_REASONING_CAPABILITIES: OpenAIModelCapabilities = {
    reasoning: {
        supportsEffort: true,
        supportedRange: ['minimal', 'low', 'medium', 'high'],
        restrictsSamplingParams: true,
    },
};

const GPT_5_PRO_REASONING_CAPABILITIES: OpenAIModelCapabilities = {
    reasoning: {
        supportsEffort: true,
        supportedRange: ['medium', 'high', 'max'],
        restrictsSamplingParams: true,
    },
};

const GPT_5_HIGH_REASONING_CAPABILITIES: OpenAIModelCapabilities = {
    reasoning: {
        supportsEffort: true,
        supportedRange: ['high'],
        restrictsSamplingParams: true,
    },
};

const NO_REASONING_EFFORT_CAPABILITIES: OpenAIModelCapabilities = {
    reasoning: {
        supportsEffort: false,
        supportedRange: [],
        restrictsSamplingParams: false,
    },
};

const O_SERIES_MAX_REASONING_CAPABILITIES: OpenAIModelCapabilities = {
    reasoning: {
        supportsEffort: true,
        supportedRange: ['low', 'medium', 'high', 'max'],
        restrictsSamplingParams: false,
    },
};

const GPT_5_6_TERRA_REASONING_CAPABILITIES: OpenAIModelCapabilities = {
    reasoning: {
        supportsEffort: true,
        supportedRange: ['low', 'medium', 'high'],
        restrictsSamplingParams: true,
    },
};

const MODEL_CAPABILITIES: Record<string, OpenAIModelCapabilities> = {
    'gpt-5.6-sol': GPT_5_MAX_REASONING_CAPABILITIES,
    'gpt-5.6-terra': GPT_5_6_TERRA_REASONING_CAPABILITIES,
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
    'gpt-5.1': {
        reasoning: {
            supportsEffort: true,
            supportedRange: ['low', 'medium', 'high'],
            restrictsSamplingParams: true,
        },
    },
    'gpt-5': GPT_5_MINIMAL_REASONING_CAPABILITIES,
    'gpt-5-mini': GPT_5_MINIMAL_REASONING_CAPABILITIES,
    'gpt-5-nano': GPT_5_MINIMAL_REASONING_CAPABILITIES,
    'gpt-5-pro': GPT_5_HIGH_REASONING_CAPABILITIES,
    'gpt-5-codex': GPT_5_MAX_REASONING_CAPABILITIES,
    'o3-pro': O_SERIES_MAX_REASONING_CAPABILITIES,
    o3: {
        reasoning: {
            supportsEffort: true,
            supportedRange: ['low', 'medium', 'high'],
            restrictsSamplingParams: false,
        },
    },
    'o3-mini': {
        reasoning: {
            supportsEffort: true,
            supportedRange: ['low', 'medium', 'high'],
            restrictsSamplingParams: false,
        },
    },
    'o4-mini': {
        reasoning: {
            supportsEffort: true,
            supportedRange: ['low', 'medium', 'high'],
            restrictsSamplingParams: false,
        },
    },
    o1: {
        reasoning: {
            supportsEffort: true,
            supportedRange: ['low', 'medium', 'high'],
            restrictsSamplingParams: false,
        },
    },
    'o1-mini': NO_REASONING_EFFORT_CAPABILITIES,
};

const EFFORT_RANK: Record<ReasoningEffort, number> = {
    minimal: 0,
    low: 1,
    medium: 2,
    high: 3,
    max: 4,
};

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
    const normalizedModelId = normalizeModelId(modelId);
    return MODEL_CAPABILITIES[normalizedModelId] ?? DEFAULT_CAPABILITIES;
}

export function normalizeModelId(modelId: string): string {
    return stripModelDateSuffix(modelId);
}

export function clampReasoningEffort(
    effort: ReasoningEffort,
    supportedRange: readonly ReasoningEffort[]
): ReasoningEffort {
    if (supportedRange.length === 0 || supportedRange.includes(effort)) {
        return effort;
    }

    const targetRank = EFFORT_RANK[effort];
    let best = supportedRange[0] ?? effort;
    let bestDistance = Math.abs(EFFORT_RANK[best] - targetRank);
    for (const candidate of supportedRange) {
        const distance = Math.abs(EFFORT_RANK[candidate] - targetRank);
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    }

    return best;
}

export function toOpenAIReasoningEffort(
    effort: ReasoningEffort
): 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' {
    return OPENAI_REASONING_EFFORT_MAP[effort];
}
