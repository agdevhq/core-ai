import type { OpenAIChatCompletionsCapabilities } from '../model-capabilities.ts';
import type { OpenAIStructuredOutputMode } from './structured-output.ts';
import type { OpenAIReasoningTokenAccounting } from './usage.ts';

export type OpenAIReasoningCompatibilityOptions = {
    requestField: 'reasoning_content' | 'reasoning';
    providerMetadataKey?: string;
};

export type OpenAICompatibilityOptions = {
    reasoning?: boolean | OpenAIReasoningCompatibilityOptions;
    structuredOutputMode?: OpenAIStructuredOutputMode;
    maxTokensParameter?: OpenAIChatCompletionsCapabilities['maxTokensParameter'];
    /** Chat Completions only. Defaults to `included`. */
    reasoningTokenAccounting?: OpenAIReasoningTokenAccounting;
};

export type OpenAICompatibility = boolean | OpenAICompatibilityOptions;

export type OpenAIResolvedReasoningCompatibilityOptions =
    Required<OpenAIReasoningCompatibilityOptions>;

export type OpenAIResolvedCompatibilityOptions = Pick<
    OpenAICompatibilityOptions,
    'structuredOutputMode' | 'maxTokensParameter' | 'reasoningTokenAccounting'
> & {
    reasoning: boolean | OpenAIResolvedReasoningCompatibilityOptions;
};
