import {
    MULTIMODAL_INPUT_MODALITIES,
    SUPPORTED_TOOL_SCHEMA_STRICTNESS,
    UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
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
    supportedEfforts: readonly ReasoningEffort[],
    supportsStrictToolSchemas: boolean,
    maxOutputTokens: number | undefined
): AnthropicModelCapabilities {
    return {
        ...(maxOutputTokens === undefined
            ? {}
            : { output: { maxTokens: maxOutputTokens } }),
        reasoning: {
            mode: 'optional',
            supportedEfforts,
            restrictsSamplingParams: true,
            supportedToolChoices: ['auto', 'none'],
        },
        modalities: MULTIMODAL_INPUT_MODALITIES,
        tools: {
            // The cap is enforced by the API but absent from Anthropic's docs
            // pages; the rejection reads: 'Too many strict tools (22). The
            // maximum number of strict tools supported is 20. Try reducing
            // the number of tools marked as strict.'
            strictSchemas: supportsStrictToolSchemas
                ? {
                      ...SUPPORTED_TOOL_SCHEMA_STRICTNESS,
                      maxStrictTools: 20,
                  }
                : UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
        },
    };
}

const ADAPTIVE_MAX_EFFORT_MODELS = new Set([
    'claude-fable-5',
    'claude-mythos-5',
    'claude-mythos-preview',
    'claude-opus-5',
    'claude-opus-4-8',
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-sonnet-5',
    'claude-sonnet-4-6',
]);

/**
 * Models known NOT to support strict tool schemas (pre-4.5 generations, per
 * Anthropic's structured-outputs docs). Unknown and future model ids resolve
 * to supported: strict is per-tool opt-in, so an explicit `strict: true` is
 * forwarded optimistically and the API rejects it if genuinely unsupported.
 */
const NON_STRICT_TOOL_SCHEMA_MODELS = new Set([
    'claude-opus-4-1',
    'claude-opus-4',
    'claude-sonnet-4',
    'claude-sonnet-3-7',
    'claude-3-7-sonnet',
    'claude-3-5-sonnet',
    'claude-3-5-haiku',
    'claude-3-opus',
    'claude-3-sonnet',
    'claude-3-haiku',
    'claude-2.1',
    'claude-2.0',
    'claude-2',
    'claude-instant-1.2',
    'claude-instant-1',
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
    'claude-opus-5',
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

/**
 * Verified synchronous Messages API `max_tokens` ceilings.
 *
 * Anthropic documents these in decimal thousands rather than powers of two: a
 * "32k" model rejects 32768 with `max_tokens: 32768 > 32000`. Ids absent from
 * this map have no verified ceiling and must be treated as unknown rather than
 * capped at a guess.
 */
const ANTHROPIC_MODEL_MAX_OUTPUT_TOKENS: Record<string, number> = {
    'claude-fable-5': 128_000,
    'claude-mythos-5': 128_000,
    'claude-mythos-preview': 128_000,
    'claude-opus-5': 128_000,
    'claude-opus-4-8': 128_000,
    'claude-opus-4-7': 128_000,
    'claude-opus-4-6': 128_000,
    'claude-sonnet-5': 128_000,
    'claude-sonnet-4-6': 128_000,
    'claude-opus-4-5': 64_000,
    'claude-sonnet-4-5': 64_000,
    'claude-haiku-4-5': 64_000,
    'claude-sonnet-4': 64_000,
    'claude-sonnet-3-7': 64_000,
    'claude-3-7-sonnet': 64_000,
    'claude-opus-4-1': 32_000,
    'claude-opus-4': 32_000,
};

export function getAnthropicModelCapabilities(
    modelId: string
): AnthropicModelCapabilities {
    const maxOutputTokens = getAnthropicModelMaxOutputTokens(modelId);
    const thinkingMode = getAnthropicThinkingMode(modelId);
    const supportedEfforts =
        supportsAnthropicMaxEffort(modelId) || thinkingMode === 'manual'
            ? MAX_EFFORTS
            : STANDARD_EFFORTS;

    return createCapabilities(
        supportedEfforts,
        supportsAnthropicStrictToolSchemas(modelId),
        maxOutputTokens
    );
}

export function getAnthropicModelMaxOutputTokens(
    modelId: string
): number | undefined {
    return ANTHROPIC_MODEL_MAX_OUTPUT_TOKENS[normalizeModelId(modelId)];
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

export function supportsAnthropicStrictToolSchemas(modelId: string): boolean {
    return !NON_STRICT_TOOL_SCHEMA_MODELS.has(normalizeModelId(modelId));
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
