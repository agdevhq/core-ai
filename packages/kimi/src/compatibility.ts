import type { GenerateOptions, ToolChoice } from '@core-ai/core-ai';
import { ValidationError } from '@core-ai/core-ai';
import type { OpenAIChatGenerateProviderOptions } from '@core-ai/openai';

import type { KimiModelCapabilities } from './model-capabilities.ts';
import { parseKimiGenerateProviderOptions } from './provider-options.ts';

export function prepareKimiGenerateOptions(
    modelId: string,
    options: GenerateOptions,
    capabilities: KimiModelCapabilities
): GenerateOptions {
    validateKimiGenerateOptions(modelId, options, capabilities);

    const kimiOptions = parseKimiGenerateProviderOptions(
        options.providerOptions
    );
    const openaiOptions: OpenAIChatGenerateProviderOptions | undefined =
        kimiOptions
            ? {
                  parallelToolCalls: kimiOptions.parallelToolCalls,
                  seed: kimiOptions.seed,
                  stopSequences: kimiOptions.stopSequences,
                  user: kimiOptions.user,
              }
            : undefined;

    return {
        ...options,
        ...(capabilities.sampling
            ? {
                  temperature: undefined,
                  topP: undefined,
              }
            : {}),
        ...(capabilities.reasoning.supportedEfforts.length === 0
            ? { reasoning: undefined }
            : {}),
        providerOptions: {
            ...options.providerOptions,
            openai: openaiOptions,
        },
    };
}

function validateKimiGenerateOptions(
    modelId: string,
    options: GenerateOptions,
    capabilities: KimiModelCapabilities
): void {
    validateKimiToolChoice(modelId, options.toolChoice, capabilities);

    const { sampling } = capabilities;
    if (!sampling) {
        return;
    }

    validateFixedSamplingValue(
        'temperature',
        options.temperature,
        sampling.fixedTemperature,
        modelId
    );
    validateFixedSamplingValue(
        'topP',
        options.topP,
        sampling.fixedTopP,
        modelId
    );
}

function validateKimiToolChoice(
    modelId: string,
    toolChoice: ToolChoice | undefined,
    capabilities: KimiModelCapabilities
): void {
    if (
        !toolChoice ||
        typeof toolChoice === 'string' ||
        !capabilities.reasoning.alwaysOn
    ) {
        return;
    }

    throw new ValidationError(
        `Kimi model "${modelId}" does not support forced tool choice when thinking is always enabled`,
        undefined,
        'kimi'
    );
}

function validateFixedSamplingValue(
    name: string,
    value: number | undefined,
    expected: number,
    modelId: string
): void {
    if (value === undefined || value === expected) {
        return;
    }

    throw new ValidationError(
        `Kimi model "${modelId}" does not support ${name}; fixed value is ${expected}`,
        undefined,
        'kimi'
    );
}
