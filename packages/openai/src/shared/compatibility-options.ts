import type { GenerateOptions, ModelCapabilities } from '@core-ai/core-ai';

import type { OpenAIChatCompletionsCapabilities } from '../model-capabilities.js';
import type { OpenAIStructuredOutputMode } from './structured-output.js';

export type OpenAIReasoningCompatibilityOptions = {
    requestField: 'reasoning_content' | 'reasoning';
    providerMetadataKey?: string;
};

export type OpenAICompatibilityOptions = {
    reasoning?: boolean | OpenAIReasoningCompatibilityOptions;
    structuredOutputMode?: OpenAIStructuredOutputMode;
    maxTokensParameter?: OpenAIChatCompletionsCapabilities['maxTokensParameter'];
    prepareGenerateOptions?: (
        modelId: string,
        options: GenerateOptions,
        capabilities: ModelCapabilities
    ) => GenerateOptions;
};

export type OpenAICompatibility = boolean | OpenAICompatibilityOptions;

export type OpenAIResolvedReasoningCompatibilityOptions =
    Required<OpenAIReasoningCompatibilityOptions>;

export type OpenAIResolvedCompatibilityOptions = Pick<
    OpenAICompatibilityOptions,
    'structuredOutputMode' | 'maxTokensParameter'
> & {
    reasoning: boolean | OpenAIResolvedReasoningCompatibilityOptions;
    prepareGenerateOptions?: (options: GenerateOptions) => GenerateOptions;
};
