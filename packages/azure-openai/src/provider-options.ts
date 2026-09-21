import type {
    OpenAIChatGenerateProviderOptions,
    OpenAIResponsesGenerateProviderOptions,
} from '@core-ai/openai';

/** Options for `chatModel()` on the v1 API (Responses). */
export type AzureOpenAIResponsesGenerateProviderOptions =
    OpenAIResponsesGenerateProviderOptions;

/** Options for `chat.chatModel()` and the classic API (Chat Completions). */
export type AzureOpenAIChatGenerateProviderOptions =
    OpenAIChatGenerateProviderOptions;

declare module '@core-ai/core-ai' {
    interface GenerateProviderOptions {
        'azure-openai'?:
            | AzureOpenAIResponsesGenerateProviderOptions
            | AzureOpenAIChatGenerateProviderOptions;
    }
}
