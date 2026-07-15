import {
    stripModelDateSuffix,
    type ModelCapabilities,
    type ReasoningEffort,
} from '@core-ai/core-ai';

export type XAIReasoningEffort = 'none' | 'low' | 'medium' | 'high';
export type XAIModelCapabilities = ModelCapabilities;

const XAI_REASONING_EFFORTS = [
    'minimal',
    'low',
    'medium',
    'high',
    'max',
] as const satisfies readonly ReasoningEffort[];

const REASONING_EFFORT_MAP: Record<ReasoningEffort, XAIReasoningEffort> = {
    minimal: 'none',
    low: 'low',
    medium: 'medium',
    high: 'high',
    max: 'high',
};

const CONFIGURABLE_REASONING_CAPABILITIES: XAIModelCapabilities = {
    reasoning: {
        supported: true,
        supportedEfforts: XAI_REASONING_EFFORTS,
        restrictsSamplingParams: false,
    },
};

const REASONING_CAPABILITIES: XAIModelCapabilities = {
    reasoning: {
        supported: true,
        supportedEfforts: [],
        restrictsSamplingParams: false,
    },
};

const NON_REASONING_CAPABILITIES: XAIModelCapabilities = {
    reasoning: {
        supported: false,
        supportedEfforts: [],
        restrictsSamplingParams: false,
    },
};

const CONFIGURABLE_REASONING_MODEL_IDS = new Set([
    'grok-4.3',
    'grok-4.3-latest',
    'grok-latest',
]);

const REASONING_MODEL_IDS = new Set([
    'grok-4.20-0309-reasoning',
    'grok-4.20-0309',
    'grok-4.20',
    'grok-4.20-reasoning',
    'grok-4.20-reasoning-latest',
    'grok-4.20-reasoning-gv2',
    'grok-4.20-beta-0309-reasoning',
    'grok-4.20-beta',
    'grok-4.20-beta-0309',
    'grok-4.20-beta-latest',
    'grok-4.20-beta-latest-reasoning',
    'grok-4.20-beta-reasoning',
    'grok-4.20-experimental-beta-0304-reasoning',
    'grok-4.20-experimental-beta-0304',
    'grok-4.20-experimental-beta-reasoning-latest',
    'grok-4.20-experimental-beta-latest',
    'grok-4.20-multi-agent-0309',
    'grok-4.20-multi-agent',
    'grok-4.20-multi-agent-latest',
    'grok-4.5',
    'grok-4.5-latest',
    'grok-build-0.1',
    'grok-build-latest',
]);

const NON_REASONING_MODEL_IDS = new Set([
    'grok-4.20-0309-non-reasoning',
    'grok-4.20-non-reasoning',
    'grok-4.20-non-reasoning-latest',
]);

const NATIVE_STRUCTURED_OUTPUT_MODEL_IDS = new Set([
    ...CONFIGURABLE_REASONING_MODEL_IDS,
    ...REASONING_MODEL_IDS,
    ...NON_REASONING_MODEL_IDS,
]);

export function normalizeModelId(modelId: string): string {
    return stripModelDateSuffix(modelId.trim().toLowerCase());
}

export function supportsReasoningEffort(modelId: string): boolean {
    return getXAIModelCapabilities(modelId).reasoning.supportedEfforts.length > 0;
}

export function isReasoningModel(modelId: string): boolean {
    return getXAIModelCapabilities(modelId).reasoning.supported;
}

export function supportsNativeStructuredOutput(modelId: string): boolean {
    return NATIVE_STRUCTURED_OUTPUT_MODEL_IDS.has(normalizeModelId(modelId));
}

export function getXAIModelCapabilities(
    modelId: string
): XAIModelCapabilities {
    const normalizedModelId = normalizeModelId(modelId);

    if (CONFIGURABLE_REASONING_MODEL_IDS.has(normalizedModelId)) {
        return CONFIGURABLE_REASONING_CAPABILITIES;
    }

    if (REASONING_MODEL_IDS.has(normalizedModelId)) {
        return REASONING_CAPABILITIES;
    }

    if (NON_REASONING_MODEL_IDS.has(normalizedModelId)) {
        return NON_REASONING_CAPABILITIES;
    }

    // Unknown models deliberately default to non-reasoning capabilities until
    // xAI documents their reasoning and sampling behavior.
    return NON_REASONING_CAPABILITIES;
}

export function toXAIReasoningEffort(
    effort: ReasoningEffort
): XAIReasoningEffort {
    return REASONING_EFFORT_MAP[effort];
}
