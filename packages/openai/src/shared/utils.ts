import type { GenerateOptions, ModelCapabilities } from '@core-ai/core-ai';
import { ValidationError } from '@core-ai/core-ai';

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
    validateReasoningConfig(
        modelId,
        options,
        getOpenAIModelCapabilities(modelId),
        'openai'
    );
}

export function validateReasoningConfig(
    modelId: string,
    options: GenerateOptions,
    capabilities: ModelCapabilities,
    providerId: string
): void {
    const reasoningEnabled =
        options.reasoning !== undefined ||
        capabilities.reasoning.mode === 'always-on';
    if (!reasoningEnabled) {
        return;
    }

    if (capabilities.reasoning.restrictsSamplingParams) {
        const restrictedSamplingParams = [
            { name: 'temperature', value: options.temperature },
            { name: 'topP', value: options.topP },
        ] as const;

        for (const { name, value } of restrictedSamplingParams) {
            if (value === undefined) {
                continue;
            }

            throw new ValidationError(
                `${providerId} model "${modelId}" does not support ${name} when reasoning is enabled`,
                undefined,
                providerId
            );
        }
    }

    const toolChoiceMode =
        typeof options.toolChoice === 'object'
            ? options.toolChoice.type
            : options.toolChoice;
    if (
        toolChoiceMode !== undefined &&
        !capabilities.reasoning.supportedToolChoices.includes(toolChoiceMode)
    ) {
        throw new ValidationError(
            `${providerId} model "${modelId}" does not support toolChoice "${toolChoiceMode}" when reasoning is enabled`,
            undefined,
            providerId
        );
    }
}
