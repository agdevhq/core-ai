import type {
    AnthropicGenerateProviderOptions,
    AnthropicSystemMessageProviderOptions,
    AnthropicToolResultMessageProviderOptions,
    AnthropicUserMessageProviderOptions,
} from '@core-ai/anthropic';

export type AnthropicVertexGenerateProviderOptions =
    AnthropicGenerateProviderOptions;

export type AnthropicVertexSystemMessageProviderOptions =
    AnthropicSystemMessageProviderOptions;

export type AnthropicVertexUserMessageProviderOptions =
    AnthropicUserMessageProviderOptions;

export type AnthropicVertexToolResultMessageProviderOptions =
    AnthropicToolResultMessageProviderOptions;

declare module '@core-ai/core-ai' {
    interface GenerateProviderOptions {
        'anthropic-vertex'?: AnthropicVertexGenerateProviderOptions;
    }

    interface SystemMessageProviderOptions {
        'anthropic-vertex'?: AnthropicVertexSystemMessageProviderOptions;
    }

    interface UserMessageProviderOptions {
        'anthropic-vertex'?: AnthropicVertexUserMessageProviderOptions;
    }

    interface ToolResultMessageProviderOptions {
        'anthropic-vertex'?: AnthropicVertexToolResultMessageProviderOptions;
    }
}
