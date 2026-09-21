export { createOpenAICompat, createOpenAICompatChatProvider } from './compat/provider.ts';
export { createOpenAICompatChatModel } from './compat/chat-model.ts';
export type {
    OpenAICompatProvider,
    OpenAICompatProviderOptions,
    OpenAICompatChatProvider,
    OpenAICompatChatProviderOptions,
} from './compat/provider.ts';
export type { OpenAIChatClient } from './compat/chat-model.ts';
export {
    openaiCompatGenerateProviderOptionsSchema,
    openaiCompatProviderOptionsSchema,
} from './provider-options.ts';
export type {
    OpenAICompatGenerateProviderOptions,
    OpenAICompatRequestOptions,
} from './provider-options.ts';
