import type { ReasoningEffort } from '@core-ai/core-ai';

/**
 * Benchmark provider registry. To add a provider, append one entry:
 *
 *   { name: 'groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' }
 *
 * The API key is read from `<NAME>_API_KEY` (uppercased, `-` → `_`), or set
 * `apiKeyEnv` to override. Every provider selected for a run requires its key
 * to be set (ad-hoc --base-url providers included).
 *
 * `model` accepts a comma-separated list to benchmark multiple models of the
 * same provider (e.g. `model: 'gpt-5-mini,gpt-5.2'`).
 */
export type ProviderSpec = {
    name: string;
    baseUrl: string;
    model: string;
    apiKeyEnv?: string;
    /** Env var the baseUrl is derived from, named in errors when unset. */
    baseUrlEnv?: string;
    /**
     * Reasoning effort sent with each request. Set to 'minimal' for
     * reasoning models so runs measure serving latency instead of thinking
     * time. Leave unset for models/endpoints that reject reasoning_effort.
     */
    reasoningEffort?: ReasoningEffort;
};

/**
 * Mirrors the providers with @core-ai packages. All entries go through each
 * vendor's OpenAI-compatible endpoint (not the native @core-ai provider
 * adapters), so every provider is measured over the same protocol.
 */
export const providers: readonly ProviderSpec[] = [
    {
        name: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-5-mini',
        reasoningEffort: 'minimal',
    },
    {
        // Azure's base URL is resource-specific (AZURE_OPENAI_ENDPOINT) and
        // `model` is a deployment name — the default assumes a deployment
        // named like the model; use --model for other deployment names.
        name: 'azure-openai',
        baseUrl: azureOpenAIBaseUrl(),
        baseUrlEnv: 'AZURE_OPENAI_ENDPOINT',
        model: 'gpt-5-mini',
        reasoningEffort: 'minimal',
    },
    {
        name: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        model: 'claude-haiku-4-5',
    },
    {
        name: 'google',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-3.5-flash',
    },
    {
        name: 'mistral',
        baseUrl: 'https://api.mistral.ai/v1',
        model: 'mistral-large-latest',
    },
    {
        name: 'omnifact',
        baseUrl: 'https://connect.omnifact.ai/v1/gateway',
        model: 'eu/gpt-5-mini',
    },
];

export function apiKeyEnvName(spec: ProviderSpec): string {
    return (
        spec.apiKeyEnv ??
        `${spec.name.toUpperCase().replaceAll('-', '_')}_API_KEY`
    );
}

export function resolveApiKey(spec: ProviderSpec): string | undefined {
    return process.env[apiKeyEnvName(spec)];
}

function azureOpenAIBaseUrl(): string {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    if (!endpoint) {
        return '';
    }
    const trimmed = endpoint.replace(/\/+$/, '');
    return trimmed.endsWith('/openai/v1') ? trimmed : `${trimmed}/openai/v1`;
}
