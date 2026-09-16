export function parseGoogleApplicationCredentialsJson(
    rawValue: string,
    envVar = 'GOOGLE_APPLICATION_CREDENTIALS_JSON'
): Record<string, unknown> {
    const trimmed = rawValue.trim();
    const parsed = parseCredentialsPayload(trimmed, envVar);

    if (!isRecord(parsed)) {
        throw new Error(`${envVar} must decode to a JSON object`);
    }

    return parsed;
}

function parseCredentialsPayload(trimmed: string, envVar: string): unknown {
    try {
        return JSON.parse(trimmed);
    } catch (plainJsonError) {
        try {
            return JSON.parse(decodeBase64Utf8(trimmed, envVar));
        } catch (base64Error) {
            throw new Error(
                `${envVar} must contain valid JSON or base64-encoded JSON`,
                { cause: base64Error ?? plainJsonError }
            );
        }
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeBase64Utf8(value: string, envVar: string): string {
    try {
        const decoded = Buffer.from(value, 'base64').toString('utf8').trim();
        if (decoded.length === 0) {
            throw new Error('empty decoded value');
        }

        return decoded;
    } catch (error) {
        throw new Error(
            `${envVar} must contain valid JSON or base64-encoded JSON`,
            { cause: error }
        );
    }
}
