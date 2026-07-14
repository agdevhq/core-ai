import {
    createOpenAIProvider,
    type OpenAIProvider as SharedOpenAIProvider,
    type OpenAIProviderBaseOptions,
} from './shared/provider-factory.js';

export type OpenAIProviderOptions = OpenAIProviderBaseOptions & {
    chat?: {
        compatibility?: boolean;
    };
};
export type OpenAIProvider = SharedOpenAIProvider;

export function createOpenAI(
    options: OpenAIProviderOptions = {}
): OpenAIProvider {
    return createOpenAIProvider(options, {
        chat: options.chat,
    });
}
