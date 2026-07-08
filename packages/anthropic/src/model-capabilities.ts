import { stripModelDateSuffix, type ReasoningEffort } from '@core-ai/core-ai';

export type AnthropicModelCapabilities = {
    reasoning: {
        thinkingMode: 'adaptive' | 'manual';
        supportsMaxEffort: boolean;
    };
};

const DEFAULT_CAPABILITIES: AnthropicModelCapabilities = {
    reasoning: {
        thinkingMode: 'adaptive',
        supportsMaxEffort: false,
    },
};

const ADAPTIVE_MAX_EFFORT_CAPABILITIES: AnthropicModelCapabilities = {
    reasoning: {
        thinkingMode: 'adaptive',
        supportsMaxEffort: true,
    },
};

const MODEL_CAPABILITIES: Record<string, AnthropicModelCapabilities> = {
    'claude-fable-5': ADAPTIVE_MAX_EFFORT_CAPABILITIES,
    'claude-mythos-5': ADAPTIVE_MAX_EFFORT_CAPABILITIES,
    'claude-mythos-preview': ADAPTIVE_MAX_EFFORT_CAPABILITIES,
    'claude-opus-4-8': ADAPTIVE_MAX_EFFORT_CAPABILITIES,
    'claude-opus-4-7': ADAPTIVE_MAX_EFFORT_CAPABILITIES,
    'claude-opus-4-6': ADAPTIVE_MAX_EFFORT_CAPABILITIES,
    'claude-sonnet-5': ADAPTIVE_MAX_EFFORT_CAPABILITIES,
    'claude-sonnet-4-6': ADAPTIVE_MAX_EFFORT_CAPABILITIES,
    'claude-opus-4-5': {
        reasoning: {
            thinkingMode: 'manual',
            supportsMaxEffort: false,
        },
    },
    'claude-sonnet-4-5': {
        reasoning: {
            thinkingMode: 'manual',
            supportsMaxEffort: false,
        },
    },
    'claude-opus-4-1': {
        reasoning: {
            thinkingMode: 'manual',
            supportsMaxEffort: false,
        },
    },
    'claude-opus-4': {
        reasoning: {
            thinkingMode: 'manual',
            supportsMaxEffort: false,
        },
    },
    'claude-sonnet-4': {
        reasoning: {
            thinkingMode: 'manual',
            supportsMaxEffort: false,
        },
    },
    'claude-haiku-4-5': {
        reasoning: {
            thinkingMode: 'manual',
            supportsMaxEffort: false,
        },
    },
    'claude-sonnet-3-7': {
        reasoning: {
            thinkingMode: 'manual',
            supportsMaxEffort: false,
        },
    },
};

const ANTHROPIC_ADAPTIVE_EFFORT_MAP: Record<
    Exclude<ReasoningEffort, 'max'>,
    'low' | 'medium' | 'high'
> = {
    minimal: 'low',
    low: 'low',
    medium: 'medium',
    high: 'high',
};

const ANTHROPIC_MANUAL_BUDGET_MAP: Record<ReasoningEffort, number> = {
    minimal: 1024,
    low: 2048,
    medium: 8192,
    high: 32768,
    max: 65536,
};

export function getAnthropicModelCapabilities(
    modelId: string
): AnthropicModelCapabilities {
    const normalizedModelId = normalizeModelId(modelId);
    return MODEL_CAPABILITIES[normalizedModelId] ?? DEFAULT_CAPABILITIES;
}

export function normalizeModelId(modelId: string): string {
    return stripModelDateSuffix(modelId);
}

export function toAnthropicAdaptiveEffort(
    effort: ReasoningEffort,
    supportsMaxEffort: boolean
): 'low' | 'medium' | 'high' | 'max' {
    if (effort === 'max') {
        return supportsMaxEffort ? 'max' : 'high';
    }
    return ANTHROPIC_ADAPTIVE_EFFORT_MAP[effort];
}

export function toAnthropicManualBudget(effort: ReasoningEffort): number {
    return ANTHROPIC_MANUAL_BUDGET_MAP[effort];
}
