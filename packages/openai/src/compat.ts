export { createOpenAICompat, createOpenAICompatChatProvider } from './compat/provider.js';
export { createOpenAICompatChatModel } from './compat/chat-model.js';
export type {
    OpenAICompatProvider,
    OpenAICompatProviderOptions,
    OpenAICompatChatProvider,
    OpenAICompatChatProviderOptions,
} from './compat/provider.js';
export type { OpenAIChatClient } from './compat/chat-model.js';
export {
    openaiCompatGenerateProviderOptionsSchema,
    openaiCompatProviderOptionsSchema,
} from './provider-options.js';
export type {
    OpenAICompatGenerateProviderOptions,
    OpenAICompatRequestOptions,
} from './provider-options.js';
