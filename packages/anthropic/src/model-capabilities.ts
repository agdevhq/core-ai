import {
    stripModelDateSuffix,
    type ModelCapabilities,
    type ReasoningEffort,
} from '@core-ai/core-ai';

export type AnthropicModelCapabilities = ModelCapabilities;

type AnthropicThinkingMode = 'adaptive' | 'manual';

const STANDARD_EFFORTS = [
    'minimal',
    'low',
    'medium',
    'high',
] as const satisfies readonly ReasoningEffort[];

const MAX_EFFORTS = [
    'minimal',
    'low',
    'medium',
    'high',
    'max',
] as const satisfies readonly ReasoningEffort[];

function createCapabilities(
    supportedEfforts: readonly ReasoningEffort[]
): AnthropicModelCapabilities {
    return {
        reasoning: {
            supported: true,
            supportedEfforts,
            restrictsSamplingParams: true,
        },
    };
}

const STANDARD_CAPABILITIES = createCapabilities(STANDARD_EFFORTS);
const MAX_EFFORT_CAPABILITIES = createCapabilities(MAX_EFFORTS);

const ADAPTIVE_MAX_EFFORT_MODELS = new Set([
    'claude-fable-5',
    'claude-mythos-5',
    'claude-mythos-preview',
    'claude-opus-4-8',
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-sonnet-5',
    'claude-sonnet-4-6',
]);

const MANUAL_THINKING_MODELS = new Set([
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'claude-opus-4-1',
    'claude-opus-4',
    'claude-sonnet-4',
    'claude-haiku-4-5',
    'claude-sonnet-3-7',
]);

const MANUAL_INTERLEAVED_THINKING_MODELS = new Set([
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'claude-opus-4-1',
    'claude-opus-4',
    'claude-sonnet-4',
]);

const ALWAYS_RESTRICTED_SAMPLING_MODELS = new Set([
    'claude-fable-5',
    'claude-mythos-5',
    'claude-mythos-preview',
    'claude-opus-4-8',
    'claude-opus-4-7',
    'claude-sonnet-5',
]);

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
    if (
        supportsAnthropicMaxEffort(modelId) ||
        getAnthropicThinkingMode(modelId) === 'manual'
    ) {
        return MAX_EFFORT_CAPABILITIES;
    }

    return STANDARD_CAPABILITIES;
}

export function normalizeModelId(modelId: string): string {
    return stripModelDateSuffix(modelId);
}

export function getAnthropicThinkingMode(
    modelId: string
): AnthropicThinkingMode {
    return MANUAL_THINKING_MODELS.has(normalizeModelId(modelId))
        ? 'manual'
        : 'adaptive';
}

export function supportsAnthropicMaxEffort(modelId: string): boolean {
    return ADAPTIVE_MAX_EFFORT_MODELS.has(normalizeModelId(modelId));
}

export function requiresAnthropicInterleavedThinkingBeta(
    modelId: string
): boolean {
    return MANUAL_INTERLEAVED_THINKING_MODELS.has(normalizeModelId(modelId));
}

export function restrictsAnthropicSamplingParamsAlways(
    modelId: string
): boolean {
    return ALWAYS_RESTRICTED_SAMPLING_MODELS.has(normalizeModelId(modelId));
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

export function toAnthropicManualBudget(
    effort: ReasoningEffort,
    maxTokens?: number
): number {
    const targetBudget = ANTHROPIC_MANUAL_BUDGET_MAP[effort];
    return maxTokens === undefined
        ? targetBudget
        : Math.min(targetBudget, maxTokens - 1);
}
