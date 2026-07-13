import { DEFAULT_PROVIDER_ID } from './chat-adapter.js';
import {
    createAnthropicCompatChatProvider,
    type AnthropicCompatChatProvider,
    type AnthropicCompatChatProviderOptions,
} from './compat.js';

export type AnthropicProviderOptions = AnthropicCompatChatProviderOptions;
export type AnthropicProvider = AnthropicCompatChatProvider;

export function createAnthropic(
    options: AnthropicProviderOptions = {}
): AnthropicProvider {
    return createAnthropicCompatChatProvider(options, DEFAULT_PROVIDER_ID);
}
