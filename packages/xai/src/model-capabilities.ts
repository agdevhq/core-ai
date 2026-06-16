import { stripModelDateSuffix, type ReasoningEffort } from '@core-ai/core-ai';

export type XAIReasoningEffort = 'none' | 'low' | 'medium' | 'high';

const REASONING_EFFORT_MAP: Record<ReasoningEffort, XAIReasoningEffort> = {
    minimal: 'none',
    low: 'low',
    medium: 'medium',
    high: 'high',
    max: 'high',
};

export function normalizeModelId(modelId: string): string {
    return stripModelDateSuffix(modelId);
}

export function supportsReasoningEffort(modelId: string): boolean {
    return normalizeModelId(modelId) === 'grok-4.3';
}

export function isReasoningModel(modelId: string): boolean {
    const normalizedModelId = normalizeModelId(modelId);

    if (normalizedModelId.includes('non-reasoning')) {
        return false;
    }

    if (normalizedModelId === 'grok-4.3') {
        return true;
    }

    if (normalizedModelId.includes('reasoning')) {
        return true;
    }

    if (normalizedModelId.includes('multi-agent')) {
        return true;
    }

    if (normalizedModelId.startsWith('grok-build-')) {
        return true;
    }

    return false;
}

export function toXAIReasoningEffort(
    effort: ReasoningEffort
): XAIReasoningEffort {
    return REASONING_EFFORT_MAP[effort];
}
