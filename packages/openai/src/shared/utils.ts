import type { GenerateOptions } from '@core-ai/core-ai';
import { ProviderError } from '@core-ai/core-ai';

import { getOpenAIModelCapabilities } from '../model-capabilities.js';

export function safeParseJsonObject(json: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(json) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
        return {};
    } catch {
        return {};
    }
}

export function validateOpenAIReasoningConfig(
    modelId: string,
    options: GenerateOptions
): void {
    if (!options.reasoning) {
        return;
    }

    const capabilities = getOpenAIModelCapabilities(modelId);
    if (!capabilities.reasoning.restrictsSamplingParams) {
        return;
    }

    if (options.config?.temperature !== undefined) {
        throw new ProviderError(
            `OpenAI model "${modelId}" does not support temperature when reasoning is enabled`,
            'openai'
        );
    }

    if (options.config?.topP !== undefined) {
        throw new ProviderError(
            `OpenAI model "${modelId}" does not support topP when reasoning is enabled`,
            'openai'
        );
    }
}
