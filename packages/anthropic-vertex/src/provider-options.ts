import type { AnthropicGenerateProviderOptions } from '@core-ai/anthropic';

export type AnthropicVertexGenerateProviderOptions =
    AnthropicGenerateProviderOptions;

declare module '@core-ai/core-ai' {
    interface GenerateProviderOptions {
        'anthropic-vertex'?: AnthropicVertexGenerateProviderOptions;
    }
}
