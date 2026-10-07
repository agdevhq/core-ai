import {
    MULTIMODAL_INPUT_MODALITIES,
    SUPPORTED_TOOL_SCHEMA_STRICTNESS,
    UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
    stripModelDateSuffix,
    type ModelCapabilities,
    type ReasoningEffort,
    type SystemMessagePlacement,
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
    reasoningMode: 'optional' | 'always-on',
    systemPlacement: SystemMessagePlacement,
    maxOutputTokens: number | undefined
): AnthropicModelCapabilities {
    return {
        ...(maxOutputTokens === undefined
            ? {}
            : { output: { maxTokens: maxOutputTokens } }),
        reasoning: {
            mode: reasoningMode,
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
        messages: { systemPlacement },
    };
}

const ADAPTIVE_MAX_EFFORT_MODELS = new Set([
    'claude-fable-5-1',
    'claude-mythos-5-1',
    'claude-fable-5',
    'claude-mythos-5',
    'claude-mythos-preview',
    'claude-opus-5-5',
    'claude-opus-5',
    'claude-opus-4-8',
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-sonnet-5-5',
    'claude-sonnet-5',
    'claude-sonnet-4-6',
    'claude-haiku-5-5',
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

/**
 * Models that reject `role: 'system'` inside `messages[]` (verified live
 * 2026-10-07 for the 4.5–4.7 generation; older ids follow). Unknown and
 * future ids resolve to `'before-reply'`: every model since Opus 4.8 and
 * Sonnet 5 accepts it (Haiku 5.5 included), and a wrong guess surfaces as
 * Anthropic's own 400.
 */
const LEADING_SYSTEM_MESSAGE_MODELS = new Set([
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    ...NON_STRICT_TOOL_SCHEMA_MODELS,
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

const ALWAYS_ON_THINKING_MODELS = new Set([
    'claude-fable-5-1',
    'claude-mythos-5-1',
    'claude-opus-5-5',
]);

const ALWAYS_REJECTED_FORCED_TOOL_CHOICE_MODELS = new Set([
    'claude-fable-5-1',
    'claude-mythos-5-1',
    'claude-opus-5-5',
    'claude-sonnet-5-5',
]);

const ALWAYS_RESTRICTED_SAMPLING_MODELS = new Set([
    'claude-fable-5-1',
    'claude-mythos-5-1',
    'claude-fable-5',
    'claude-mythos-5',
    'claude-mythos-preview',
    'claude-opus-5-5',
    'claude-opus-5',
    'claude-opus-4-8',
    'claude-opus-4-7',
    'claude-sonnet-5-5',
    'claude-sonnet-5',
    'claude-haiku-5-5',
]);

/**
 * Models that accept an explicit `top_p` only when it is 0.99, and that
 * reject a request setting both `temperature` and `top_p`.
 */
const TOP_P_099_MODELS = new Set(['claude-haiku-5-5']);

const ANTHROPIC_ADAPTIVE_EFFORT_MAP: Record<
    Exclude<ReasoningEffort, 'max'>,
    'low' | 'medium' | 'high'
> = {
    minimal: 'low',
    low: 'low',
    medium: 'medium',
    high: 'high',
};

/**
 * Synchronous Messages API output ceilings, from the Models API (`max_tokens`)
 * and Anthropic's model pages. Retired models stay listed because Bedrock and
 * Vertex retire on their own schedules.
 */
const MAX_OUTPUT_TOKENS: Record<string, number> = {
    'claude-fable-5-1': 128_000,
    'claude-mythos-5-1': 128_000,
    'claude-fable-5': 128_000,
    'claude-mythos-5': 128_000,
    'claude-mythos-preview': 128_000,
    'claude-opus-5-5': 128_000,
    'claude-opus-5': 128_000,
    'claude-opus-4-8': 128_000,
    'claude-opus-4-7': 128_000,
    'claude-opus-4-6': 128_000,
    'claude-sonnet-5-5': 128_000,
    'claude-sonnet-5': 128_000,
    'claude-sonnet-4-6': 128_000,
    'claude-haiku-5-5': 128_000,
    'claude-opus-4-5': 64_000,
    'claude-sonnet-4-5': 64_000,
    'claude-haiku-4-5': 64_000,
    'claude-sonnet-4': 64_000,
    'claude-sonnet-3-7': 64_000,
    'claude-3-7-sonnet': 64_000,
    'claude-opus-4-1': 32_000,
    'claude-opus-4': 32_000,
};

/**
 * core-ai's own effort ladder for manual thinking; Anthropic only requires
 * 1,024 <= budget_tokens < max_tokens. The lower efforts are fixed. `high` and
 * `max` take half and three quarters of the model's output ceiling, so every
 * budget fits an omitted `maxTokens` and leaves room for the answer.
 */
const ANTHROPIC_MANUAL_BUDGET_LADDER: Record<
    'minimal' | 'low' | 'medium',
    number
> = {
    minimal: 1024,
    low: 2048,
    medium: 8192,
};

/** Ceiling assumed for manual-thinking models without a known one. */
const FALLBACK_MANUAL_THINKING_CEILING = 64_000;

export function getAnthropicModelCapabilities(
    modelId: string
): AnthropicModelCapabilities {
    const supportedEfforts =
        supportsAnthropicMaxEffort(modelId) ||
        getAnthropicThinkingMode(modelId) === 'manual'
            ? MAX_EFFORTS
            : STANDARD_EFFORTS;

    return createCapabilities(
        supportedEfforts,
        supportsAnthropicStrictToolSchemas(modelId),
        isAnthropicThinkingAlwaysOn(modelId) ? 'always-on' : 'optional',
        getAnthropicSystemPlacement(modelId),
        MAX_OUTPUT_TOKENS[normalizeModelId(modelId)]
    );
}

function getAnthropicSystemPlacement(modelId: string): SystemMessagePlacement {
    return LEADING_SYSTEM_MESSAGE_MODELS.has(normalizeModelId(modelId))
        ? 'leading'
        : 'before-reply';
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

export function isAnthropicThinkingAlwaysOn(modelId: string): boolean {
    return ALWAYS_ON_THINKING_MODELS.has(normalizeModelId(modelId));
}

export function rejectsAnthropicForcedToolChoiceAlways(
    modelId: string
): boolean {
    return ALWAYS_REJECTED_FORCED_TOOL_CHOICE_MODELS.has(
        normalizeModelId(modelId)
    );
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

export function getAnthropicDefaultTopP(modelId: string): number {
    return TOP_P_099_MODELS.has(normalizeModelId(modelId)) ? 0.99 : 1;
}

export function rejectsAnthropicCombinedSamplingParams(
    modelId: string
): boolean {
    return TOP_P_099_MODELS.has(normalizeModelId(modelId));
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
    maxOutputTokens = FALLBACK_MANUAL_THINKING_CEILING
): number {
    if (effort === 'max') {
        return Math.floor(maxOutputTokens * 0.75);
    }
    if (effort === 'high') {
        return Math.floor(maxOutputTokens * 0.5);
    }
    return ANTHROPIC_MANUAL_BUDGET_LADDER[effort];
}
