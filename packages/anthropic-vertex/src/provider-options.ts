import type {
    AnthropicGenerateProviderOptions,
    AnthropicSystemMessageProviderOptions,
} from '@core-ai/anthropic';

export type AnthropicVertexGenerateProviderOptions =
    AnthropicGenerateProviderOptions;

export type AnthropicVertexSystemMessageProviderOptions =
    AnthropicSystemMessageProviderOptions;

declare module '@core-ai/core-ai' {
    interface GenerateProviderOptions {
        'anthropic-vertex'?: AnthropicVertexGenerateProviderOptions;
    }

    interface SystemMessageProviderOptions {
        'anthropic-vertex'?: AnthropicVertexSystemMessageProviderOptions;
    }
}
