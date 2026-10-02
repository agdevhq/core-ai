import {
    stripModelDateSuffix,
    UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
    type ModelCapabilities,
    type ReasoningEffort,
} from '@core-ai/core-ai';

/** Inclusive `thinkingBudget` bounds a Gemini 2.5 model accepts. */
export type GoogleThinkingBudgetRange = {
    min: number;
    max: number;
};

export type GoogleModelCapabilities = Omit<ModelCapabilities, 'reasoning'> & {
    reasoning: ModelCapabilities['reasoning'] & {
        thinkingParam: 'thinkingLevel' | 'thinkingBudget';
        /** Only set for known models steered by a numeric budget. */
        thinkingBudgetRange?: GoogleThinkingBudgetRange;
    };
};

const ALL_EFFORTS = [
    'minimal',
    'low',
    'medium',
    'high',
    'max',
] as const satisfies readonly ReasoningEffort[];

const GOOGLE_INPUT_MODALITIES = {
    input: ['text', 'image', 'file', 'audio'],
    output: ['text'],
} as const satisfies ModelCapabilities['modalities'];

function createCapabilities(config: {
    thinkingParam: GoogleModelCapabilities['reasoning']['thinkingParam'];
    mode: GoogleModelCapabilities['reasoning']['mode'];
    thinkingBudgetRange?: GoogleThinkingBudgetRange;
    maxOutputTokens?: number;
}): GoogleModelCapabilities {
    return {
        ...(config.maxOutputTokens === undefined
            ? {}
            : { output: { maxTokens: config.maxOutputTokens } }),
        reasoning: {
            mode: config.mode,
            supportedEfforts: ALL_EFFORTS,
            restrictsSamplingParams: false,
            supportedToolChoices: ['auto', 'none', 'required', 'tool'],
            thinkingParam: config.thinkingParam,
            ...(config.thinkingBudgetRange === undefined
                ? {}
                : { thinkingBudgetRange: config.thinkingBudgetRange }),
        },
        modalities: GOOGLE_INPUT_MODALITIES,
        tools: {
            strictSchemas: UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
        },
    };
}

/** `outputTokenLimit` of every Gemini 2.5 and 3 text model (Models API). */
const GEMINI_MAX_OUTPUT_TOKENS = 65_536;

const DEFAULT_CAPABILITIES = createCapabilities({
    thinkingParam: 'thinkingBudget',
    mode: 'optional',
});
// Budget ranges from https://ai.google.dev/gemini-api/docs/generate-content/thinking
const GEMINI_25_PRO_CAPABILITIES = createCapabilities({
    thinkingParam: 'thinkingBudget',
    mode: 'always-on',
    thinkingBudgetRange: { min: 128, max: 32_768 },
    maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
});
const GEMINI_25_FLASH_CAPABILITIES = createCapabilities({
    thinkingParam: 'thinkingBudget',
    mode: 'optional',
    thinkingBudgetRange: { min: 0, max: 24_576 },
    maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
});
const GEMINI_25_FLASH_LITE_CAPABILITIES = createCapabilities({
    thinkingParam: 'thinkingBudget',
    mode: 'optional',
    thinkingBudgetRange: { min: 512, max: 24_576 },
    maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
});
const THINKING_LEVEL_CAPABILITIES = createCapabilities({
    thinkingParam: 'thinkingLevel',
    mode: 'always-on',
    maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
});

const MODEL_CAPABILITIES: Record<string, GoogleModelCapabilities> = {
    'gemini-3.8-flash': THINKING_LEVEL_CAPABILITIES,
    'gemini-3.7-flash': THINKING_LEVEL_CAPABILITIES,
    'gemini-3.6-flash': THINKING_LEVEL_CAPABILITIES,
    'gemini-3.5-flash': THINKING_LEVEL_CAPABILITIES,
    'gemini-3.5-flash-lite': THINKING_LEVEL_CAPABILITIES,
    'gemini-3.1-pro': THINKING_LEVEL_CAPABILITIES,
    'gemini-3.1-pro-preview': THINKING_LEVEL_CAPABILITIES,
    'gemini-3.1-flash-lite': THINKING_LEVEL_CAPABILITIES,
    'gemini-3.1-flash-lite-preview': THINKING_LEVEL_CAPABILITIES,
    'gemini-3-pro': THINKING_LEVEL_CAPABILITIES,
    'gemini-2.5-pro': GEMINI_25_PRO_CAPABILITIES,
    'gemini-2.5-flash': GEMINI_25_FLASH_CAPABILITIES,
    'gemini-2.5-flash-lite': GEMINI_25_FLASH_LITE_CAPABILITIES,
};

const GOOGLE_THINKING_LEVEL_MAP: Record<ReasoningEffort, 'LOW' | 'HIGH'> = {
    minimal: 'LOW',
    low: 'LOW',
    medium: 'LOW',
    high: 'HIGH',
    max: 'HIGH',
};

/**
 * core-ai's own effort ladder; Google documents only the valid range. The
 * lower efforts fit every documented range. `max` is the model's documented
 * maximum and `high` 75% of it, so the two stay distinct.
 */
const GOOGLE_THINKING_BUDGET_LADDER: Record<
    'minimal' | 'low' | 'medium',
    number
> = {
    minimal: 1024,
    low: 4096,
    medium: 16384,
};

/** Assumed maximum for budget-steered models without a documented range. */
const FALLBACK_THINKING_BUDGET_MAX = 32_768;

export function getGoogleModelCapabilities(
    modelId: string
): GoogleModelCapabilities {
    const normalizedModelId = normalizeModelId(modelId);
    return MODEL_CAPABILITIES[normalizedModelId] ?? DEFAULT_CAPABILITIES;
}

export function normalizeModelId(modelId: string): string {
    return stripModelDateSuffix(modelId);
}

export function toGoogleThinkingLevel(effort: ReasoningEffort): 'LOW' | 'HIGH' {
    return GOOGLE_THINKING_LEVEL_MAP[effort];
}

export function toGoogleThinkingBudget(
    effort: ReasoningEffort,
    range?: GoogleThinkingBudgetRange
): number {
    const max = range?.max ?? FALLBACK_THINKING_BUDGET_MAX;
    if (effort === 'max') {
        return max;
    }
    if (effort === 'high') {
        return Math.floor(max * 0.75);
    }
    return GOOGLE_THINKING_BUDGET_LADDER[effort];
}
