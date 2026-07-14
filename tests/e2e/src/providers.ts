import { createAnthropicAdapter } from './adapters/anthropic.adapter.ts';
import {
    createAzureOpenAIAdapter,
    createAzureOpenAIChatAdapter,
    createAzureOpenAIClassicAdapter,
} from './adapters/azure-openai.adapter.ts';
import { createGoogleGenAIAdapter } from './adapters/google-genai.adapter.ts';
import { createMistralAdapter } from './adapters/mistral.adapter.ts';
import { createOmnifactAdapter } from './adapters/omnifact.adapter.ts';
import { createOpenAICompatAdapter } from './adapters/openai-compat.adapter.ts';
import {
    createOpenAIAdapter,
    createOpenAIChatAdapter,
} from './adapters/openai.adapter.ts';
import type { ProviderE2EAdapter } from './adapters/provider-adapter.ts';
import type { ProviderId } from './adapters/provider-adapter.ts';
import { createAnthropicVertexAdapter } from './adapters/anthropic-vertex.adapter.ts';

export function getRegisteredProviders(): ProviderE2EAdapter[] {
    const adapters = [
        createOpenAIAdapter(),
        createOpenAIChatAdapter(),
        createOpenAICompatAdapter(),
        createAzureOpenAIAdapter(),
        createAzureOpenAIChatAdapter(),
        createAzureOpenAIClassicAdapter(),
        createAnthropicAdapter(),
        createAnthropicVertexAdapter(),
        createGoogleGenAIAdapter(),
        createMistralAdapter(),
        createOmnifactAdapter(),
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

    return adapters.filter((adapter) =>
        requestedProviderIds.includes(adapter.id)
    );
}

function getProviderFilter(): string | undefined {
    return process.env.E2E_PROVIDER ?? process.env.E2E_PROVIDERS;
}
