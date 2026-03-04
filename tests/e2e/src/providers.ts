import { createAnthropicAdapter } from './adapters/anthropic.adapter.ts';
import { createGoogleGenAIAdapter } from './adapters/google-genai.adapter.ts';
import { createMistralAdapter } from './adapters/mistral.adapter.ts';
import { createOpenAICompatAdapter } from './adapters/openai-compat.adapter.ts';
import { createOpenAIAdapter } from './adapters/openai.adapter.ts';
import type { ProviderE2EAdapter } from './adapters/provider-adapter.ts';
import type { ProviderId } from './adapters/provider-adapter.ts';

export function getRegisteredProviders(): ProviderE2EAdapter[] {
    const adapters = [
        createOpenAIAdapter(),
        createOpenAICompatAdapter(),
        createAnthropicAdapter(),
        createGoogleGenAIAdapter(),
        createMistralAdapter(),
    ];

    const providerFilter = getProviderFilter();
    if (!providerFilter) {
        return adapters;
    }

    const allowedProviderIds = new Set<ProviderId>(adapters.map((a) => a.id));
    const requestedProviderIds = providerFilter
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0);

    const unknownProviderIds = requestedProviderIds.filter(
        (id) => !allowedProviderIds.has(id as ProviderId)
    );
    if (unknownProviderIds.length > 0) {
        throw new Error(
            `Unknown E2E provider id(s): ${unknownProviderIds.join(', ')}. ` +
                `Expected one of: ${Array.from(allowedProviderIds).join(', ')}.`
        );
    }

    return adapters.filter((adapter) => requestedProviderIds.includes(adapter.id));
}

function getProviderFilter(): string | undefined {
    return process.env.E2E_PROVIDER ?? process.env.E2E_PROVIDERS;
}
