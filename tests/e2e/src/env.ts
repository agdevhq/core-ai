export function hasApiKey(envVar: string): boolean {
    return getEnvValue(envVar) !== undefined;
}

export function getEnvValue(envVar: string): string | undefined {
    const value = process.env[envVar]?.trim();
    return value && value.length > 0 ? value : undefined;
}

export function getEnvOrDefault(envVar: string, fallback: string): string {
    return getEnvValue(envVar) ?? fallback;
}
