import {
    createOpenAIProvider,
    type OpenAIProvider as SharedOpenAIProvider,
    type OpenAIProviderBaseOptions,
} from './shared/provider-factory.ts';

export type OpenAIProviderOptions = OpenAIProviderBaseOptions;
export type OpenAIProvider = SharedOpenAIProvider;

export function createOpenAI(
    options: OpenAIProviderOptions = {}
): OpenAIProvider {
    return createOpenAIProvider(options);
}
