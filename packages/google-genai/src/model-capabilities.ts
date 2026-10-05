import {
    clampReasoningEffort,
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

/**
 * Thinking levels each Gemini 3 model accepts, expressed as the efforts that
 * map onto them one to one. From
 * https://ai.google.dev/gemini-api/docs/thinking and
 * https://ai.google.dev/gemini-api/docs/gemini-3. An effort outside a model's
 * list is clamped to the nearest level, so `max` always resolves to `high`.
 */
const FOUR_LEVEL_EFFORTS = [
    'minimal',
    'low',
    'medium',
    'high',
] as const satisfies readonly ReasoningEffort[];

const THREE_LEVEL_EFFORTS = [
    'low',
    'medium',
    'high',
] as const satisfies readonly ReasoningEffort[];

const TWO_LEVEL_EFFORTS = [
    'low',
    'high',
] as const satisfies readonly ReasoningEffort[];

const GOOGLE_INPUT_MODALITIES = {
    input: ['text', 'image', 'file', 'audio'],
    output: ['text'],
} as const satisfies ModelCapabilities['modalities'];

function createCapabilities(config: {
    thinkingParam: GoogleModelCapabilities['reasoning']['thinkingParam'];
    mode: GoogleModelCapabilities['reasoning']['mode'];
    supportedEfforts?: readonly ReasoningEffort[];
    thinkingBudgetRange?: GoogleThinkingBudgetRange;
    maxOutputTokens?: number;
}): GoogleModelCapabilities {
    return {
        ...(config.maxOutputTokens === undefined
            ? {}
            : { output: { maxTokens: config.maxOutputTokens } }),
        reasoning: {
            mode: config.mode,
            supportedEfforts: config.supportedEfforts ?? ALL_EFFORTS,
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
function createThinkingLevelCapabilities(
    supportedEfforts: readonly ReasoningEffort[]
): GoogleModelCapabilities {
    return createCapabilities({
        thinkingParam: 'thinkingLevel',
        mode: 'always-on',
        supportedEfforts,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
    });
}
const FOUR_LEVEL_CAPABILITIES =
    createThinkingLevelCapabilities(FOUR_LEVEL_EFFORTS);
const THREE_LEVEL_CAPABILITIES =
    createThinkingLevelCapabilities(THREE_LEVEL_EFFORTS);
const TWO_LEVEL_CAPABILITIES =
    createThinkingLevelCapabilities(TWO_LEVEL_EFFORTS);

const MODEL_CAPABILITIES: Record<string, GoogleModelCapabilities> = {
    'gemini-3.8-flash': THREE_LEVEL_CAPABILITIES,
    'gemini-3.7-flash': THREE_LEVEL_CAPABILITIES,
    'gemini-3.6-flash': FOUR_LEVEL_CAPABILITIES,
    'gemini-3.5-flash': FOUR_LEVEL_CAPABILITIES,
    'gemini-3.5-flash-lite': FOUR_LEVEL_CAPABILITIES,
    'gemini-3.1-pro': THREE_LEVEL_CAPABILITIES,
    'gemini-3.1-pro-preview': THREE_LEVEL_CAPABILITIES,
    'gemini-3.1-flash-lite': FOUR_LEVEL_CAPABILITIES,
    'gemini-3.1-flash-lite-preview': FOUR_LEVEL_CAPABILITIES,
    'gemini-3-pro': TWO_LEVEL_CAPABILITIES,
    'gemini-2.5-pro': GEMINI_25_PRO_CAPABILITIES,
    'gemini-2.5-flash': GEMINI_25_FLASH_CAPABILITIES,
    'gemini-2.5-flash-lite': GEMINI_25_FLASH_LITE_CAPABILITIES,
};

export type GoogleThinkingLevel = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';

/** Gemini has no level above `HIGH`, so `max` shares it. */
const GOOGLE_THINKING_LEVEL_MAP: Record<ReasoningEffort, GoogleThinkingLevel> =
    {
        minimal: 'MINIMAL',
        low: 'LOW',
        medium: 'MEDIUM',
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

/**
 * Resolves an effort to a thinking level the model accepts: the effort is
 * clamped to the model's own levels first, since Gemini rejects a level the
 * model does not have.
 */
export function toGoogleThinkingLevel(
    effort: ReasoningEffort,
    supportedEfforts: readonly ReasoningEffort[]
): GoogleThinkingLevel {
    return GOOGLE_THINKING_LEVEL_MAP[
        clampReasoningEffort(effort, supportedEfforts)
    ];
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
