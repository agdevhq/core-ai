import type { ReasoningEffort } from '@core-ai/core-ai';

export type GoogleModelCapabilities = {
    reasoning: {
        thinkingParam: 'thinkingLevel' | 'thinkingBudget';
        canDisableThinking: boolean;
    };
};

const DEFAULT_CAPABILITIES: GoogleModelCapabilities = {
    reasoning: {
        thinkingParam: 'thinkingBudget',
        canDisableThinking: true,
    },
};

const MODEL_CAPABILITIES: Record<string, GoogleModelCapabilities> = {
    'gemini-3-pro': {
        reasoning: {
            thinkingParam: 'thinkingLevel',
            canDisableThinking: false,
        },
    },
    'gemini-2.5-pro': {
        reasoning: {
            thinkingParam: 'thinkingBudget',
            canDisableThinking: false,
        },
    },
    'gemini-2.5-flash': {
        reasoning: {
            thinkingParam: 'thinkingBudget',
            canDisableThinking: true,
        },
    },
    'gemini-2.5-flash-lite': {
        reasoning: {
            thinkingParam: 'thinkingBudget',
            canDisableThinking: true,
        },
    },
};

export function getGoogleModelCapabilities(
    modelId: string
): GoogleModelCapabilities {
    const normalizedModelId = normalizeModelId(modelId);
    return MODEL_CAPABILITIES[normalizedModelId] ?? DEFAULT_CAPABILITIES;
}

export function normalizeModelId(modelId: string): string {
    return modelId.replace(/-\d{8}$/, '');
}

export function toGoogleThinkingLevel(effort: ReasoningEffort): 'LOW' | 'HIGH' {
    if (effort === 'high' || effort === 'max') {
        return 'HIGH';
    }
    return 'LOW';
}

export function toGoogleThinkingBudget(effort: ReasoningEffort): number {
    if (effort === 'minimal') {
        return 1024;
    }
    if (effort === 'low') {
        return 4096;
    }
    if (effort === 'medium') {
        return 16384;
    }
    return 32768;
}
