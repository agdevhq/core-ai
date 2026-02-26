import { createAnthropicAdapter } from './adapters/anthropic.adapter.ts';
import { createGoogleGenAIAdapter } from './adapters/google-genai.adapter.ts';
import { createMistralAdapter } from './adapters/mistral.adapter.ts';
import { createOpenAIAdapter } from './adapters/openai.adapter.ts';
import type { ProviderE2EAdapter } from './adapters/provider-adapter.ts';

export function getRegisteredProviders(): ProviderE2EAdapter[] {
    return [
        createOpenAIAdapter(),
        createAnthropicAdapter(),
        createGoogleGenAIAdapter(),
        createMistralAdapter(),
    ];
}
