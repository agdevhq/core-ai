import type { OpenAIChatGenerateProviderOptions } from '@core-ai/openai';

export type OmnifactGenerateProviderOptions = OpenAIChatGenerateProviderOptions;

declare module '@core-ai/core-ai' {
    interface GenerateProviderOptions {
        omnifact?: OmnifactGenerateProviderOptions;
    }
}
