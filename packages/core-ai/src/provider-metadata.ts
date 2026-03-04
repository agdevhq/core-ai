export function getProviderMetadata<T extends Record<string, unknown>>(
    providerMetadata: Record<string, Record<string, unknown>> | undefined,
    provider: string
): T | undefined {
    return providerMetadata?.[provider] as T | undefined;
}
