import type { OpenAIChatGenerateProviderOptions } from '@core-ai/openai';

export type OpenAICompatGenerateProviderOptions =
    OpenAIChatGenerateProviderOptions;

declare module '@core-ai/core-ai' {
    interface GenerateProviderOptions {
        'openai-compat'?: OpenAICompatGenerateProviderOptions;
    }
}
