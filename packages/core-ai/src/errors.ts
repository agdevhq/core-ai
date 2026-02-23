export class LLMError extends Error {
    public readonly cause?: unknown;

    constructor(message: string, cause?: unknown) {
        super(message);
        this.name = 'LLMError';
        this.cause = cause;
    }
}

export class ProviderError extends LLMError {
    public readonly provider: string;
    public readonly statusCode?: number;

    constructor(
        message: string,
        provider: string,
        statusCode?: number,
        cause?: unknown
    ) {
        super(message, cause);
        this.name = 'ProviderError';
        this.provider = provider;
        this.statusCode = statusCode;
    }
}
