import {
    createOpenAIProvider,
    type OpenAIProvider as SharedOpenAIProvider,
    type OpenAIProviderBaseOptions,
} from './shared/provider-factory.js';
import { OPENAI_MODEL_CAPABILITIES } from './model-capabilities.js';

export type OpenAIProviderOptions = OpenAIProviderBaseOptions;
export type OpenAIProvider = SharedOpenAIProvider;

export function createOpenAI(
    options: OpenAIProviderOptions = {}
): OpenAIProvider {
    return createOpenAIProvider(options, {
        modelCapabilities: OPENAI_MODEL_CAPABILITIES,
    });
}
