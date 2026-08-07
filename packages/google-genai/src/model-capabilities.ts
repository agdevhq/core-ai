import {
    stripModelDateSuffix,
    type ModelCapabilities,
    type ReasoningEffort,
} from '@core-ai/core-ai';

export type GoogleModelCapabilities = Omit<ModelCapabilities, 'reasoning'> & {
    reasoning: ModelCapabilities['reasoning'] & {
        thinkingParam: 'thinkingLevel' | 'thinkingBudget';
    };
};

const ALL_EFFORTS = [
    'minimal',
    'low',
    'medium',
    'high',
    'max',
] as const satisfies readonly ReasoningEffort[];

function createCapabilities(config: {
    thinkingParam: GoogleModelCapabilities['reasoning']['thinkingParam'];
    mode: GoogleModelCapabilities['reasoning']['mode'];
}): GoogleModelCapabilities {
    return {
        reasoning: {
            mode: config.mode,
            supportedEfforts: ALL_EFFORTS,
            restrictsSamplingParams: false,
            supportedToolChoices: ['auto', 'none', 'required', 'tool'],
            thinkingParam: config.thinkingParam,
        },
        // URL sources map to `fileData.fileUri` (HTTP(S), gs://, Files API).
        modalities: { imageInput: true },
    };
}

const DEFAULT_CAPABILITIES = createCapabilities({
    thinkingParam: 'thinkingBudget',
    mode: 'optional',
});
const REQUIRED_THINKING_BUDGET_CAPABILITIES = createCapabilities({
    thinkingParam: 'thinkingBudget',
    mode: 'always-on',
});
const THINKING_LEVEL_CAPABILITIES = createCapabilities({
    thinkingParam: 'thinkingLevel',
    mode: 'always-on',
});

const MODEL_CAPABILITIES: Record<string, GoogleModelCapabilities> = {
    'gemini-3.1-pro': THINKING_LEVEL_CAPABILITIES,
    'gemini-3.1-flash-lite-preview': THINKING_LEVEL_CAPABILITIES,
    'gemini-3-pro': THINKING_LEVEL_CAPABILITIES,
    'gemini-2.5-pro': REQUIRED_THINKING_BUDGET_CAPABILITIES,
    'gemini-2.5-flash': DEFAULT_CAPABILITIES,
    'gemini-2.5-flash-lite': DEFAULT_CAPABILITIES,
};

const GOOGLE_THINKING_LEVEL_MAP: Record<ReasoningEffort, 'LOW' | 'HIGH'> = {
    minimal: 'LOW',
    low: 'LOW',
    medium: 'LOW',
    high: 'HIGH',
    max: 'HIGH',
};

const GOOGLE_THINKING_BUDGET_MAP: Record<ReasoningEffort, number> = {
    minimal: 1024,
    low: 4096,
    medium: 16384,
    high: 32768,
    max: 32768,
};

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

export function toGoogleThinkingBudget(effort: ReasoningEffort): number {
    return GOOGLE_THINKING_BUDGET_MAP[effort];
}
