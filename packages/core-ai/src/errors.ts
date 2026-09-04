export class CoreAIError extends Error {
    public readonly cause?: unknown;
    public readonly provider?: string;

    constructor(message: string, cause?: unknown, provider?: string) {
        super(message);
        this.name = 'CoreAIError';
        this.cause = cause;
        this.provider = provider;
    }
}

export class ValidationError extends CoreAIError {
    constructor(message: string, cause?: unknown, provider?: string) {
        super(message, cause, provider);
        this.name = 'ValidationError';
    }
}

export type UnsupportedInputModalityErrorOptions = {
    modelId: string;
    providerId: string;
    requestedModalities: readonly string[];
    supportedModalities: readonly string[];
    unsupportedModalities: readonly string[];
};

/**
 * Thrown when user messages include content parts the model does not accept.
 * Extends {@link ValidationError} so existing `instanceof ValidationError`
 * checks still match.
 */
export class UnsupportedInputModalityError extends ValidationError {
    public readonly requestedModalities: readonly string[];
    public readonly supportedModalities: readonly string[];
    public readonly unsupportedModalities: readonly string[];

    constructor(options: UnsupportedInputModalityErrorOptions) {
        const unsupported = options.unsupportedModalities.join(', ');
        const supported = options.supportedModalities.join(', ') || '(none)';
        const modalityWord =
            options.unsupportedModalities.length === 1
                ? 'modality'
                : 'modalities';

        super(
            `${options.providerId} model "${options.modelId}" does not support input ${modalityWord}: ${unsupported}. Supported: ${supported}`,
            undefined,
            options.providerId
        );
        this.name = 'UnsupportedInputModalityError';
        this.requestedModalities = options.requestedModalities;
        this.supportedModalities = options.supportedModalities;
        this.unsupportedModalities = options.unsupportedModalities;
    }
}

export class AbortedError extends CoreAIError {
    constructor(cause?: unknown, provider?: string) {
        super('operation aborted', cause, provider);
        this.name = 'AbortedError';
    }
}

export class StreamAbortedError extends AbortedError {
    constructor(cause?: unknown, provider?: string) {
        super(cause, provider);
        this.name = 'StreamAbortedError';
        this.message = 'stream aborted';
    }
}

export type ProviderErrorOptions = {
    statusCode?: number;
    /**
     * Provider-specific error code or type as reported by the API, e.g.
     * `insufficient_quota`, `invalid_request_error`, `RESOURCE_EXHAUSTED`.
     * Stable machine-readable identifier for logging and classification
     * where the message itself cannot be recorded.
     */
    code?: string;
    cause?: unknown;
};

export class ProviderError extends CoreAIError {
    public readonly statusCode?: number;
    public readonly code?: string;

    /**
     * @param message Human-readable error message (may include provider text).
     * @param provider Provider id (e.g. `'openai'`, `'anthropic'`).
     * @param options Optional HTTP status, provider code, and underlying cause.
     */
    constructor(
        message: string,
        provider: string,
        options: ProviderErrorOptions = {}
    ) {
        super(message, options.cause, provider);
        this.name = 'ProviderError';
        this.statusCode = options.statusCode;
        this.code = options.code;
    }
}

/**
 * Base class for transient provider failures that are safe to retry
 * (rate limits, overload, temporary unavailability).
 * Discriminate with `instanceof RetryableProviderError`.
 */
export class RetryableProviderError extends ProviderError {
    constructor(
        message: string,
        provider: string,
        options: ProviderErrorOptions = {}
    ) {
        super(message, provider, options);
        this.name = 'RetryableProviderError';
    }
}

export type ContextLengthExceededErrorOptions = ProviderErrorOptions & {
    maxTokens?: number;
    actualTokens?: number;
};

export class ContextLengthExceededError extends ProviderError {
    public readonly maxTokens?: number;
    public readonly actualTokens?: number;

    constructor(
        message: string,
        provider: string,
        options: ContextLengthExceededErrorOptions = {}
    ) {
        super(message, provider, {
            statusCode: options.statusCode,
            code: options.code,
            cause: options.cause,
        });
        this.name = 'ContextLengthExceededError';
        this.maxTokens = options.maxTokens;
        this.actualTokens = options.actualTokens;
    }
}

export type ProviderQuotaExceededErrorOptions = ProviderErrorOptions;

/**
 * The provider account cannot accept requests because its billing quota or
 * credit balance is exhausted. This is not retryable until the account
 * configuration changes.
 */
export class ProviderQuotaExceededError extends ProviderError {
    constructor(
        message: string,
        provider: string,
        options: ProviderQuotaExceededErrorOptions = {}
    ) {
        super(message, provider, options);
        this.name = 'ProviderQuotaExceededError';
    }
}

export type RateLimitErrorOptions = ProviderErrorOptions & {
    retryAfterSeconds?: number;
};

export class RateLimitError extends RetryableProviderError {
    public readonly retryAfterSeconds?: number;

    constructor(
        message: string,
        provider: string,
        options: RateLimitErrorOptions = {}
    ) {
        super(message, provider, {
            statusCode: options.statusCode ?? 429,
            code: options.code,
            cause: options.cause,
        });
        this.name = 'RateLimitError';
        this.retryAfterSeconds = options.retryAfterSeconds;
    }
}

export type ModelOverloadedErrorOptions = ProviderErrorOptions;

export class ModelOverloadedError extends RetryableProviderError {
    constructor(
        message: string,
        provider: string,
        options: ModelOverloadedErrorOptions = {}
    ) {
        super(message, provider, options);
        this.name = 'ModelOverloadedError';
    }
}

export type ServiceUnavailableErrorOptions = ProviderErrorOptions;

export class ServiceUnavailableError extends RetryableProviderError {
    constructor(
        message: string,
        provider: string,
        options: ServiceUnavailableErrorOptions = {}
    ) {
        super(message, provider, options);
        this.name = 'ServiceUnavailableError';
    }
}

type StructuredOutputErrorOptions = {
    statusCode?: number;
    cause?: unknown;
    rawOutput?: string;
};

export class StructuredOutputError extends CoreAIError {
    public readonly statusCode?: number;
    public readonly rawOutput?: string;

    constructor(
        message: string,
        provider: string,
        options: StructuredOutputErrorOptions = {}
    ) {
        super(message, options.cause, provider);
        this.name = 'StructuredOutputError';
        this.statusCode = options.statusCode;
        this.rawOutput = options.rawOutput;
    }
}

export class StructuredOutputNoObjectGeneratedError extends StructuredOutputError {
    constructor(
        message: string,
        provider: string,
        options: StructuredOutputErrorOptions = {}
    ) {
        super(message, provider, options);
        this.name = 'StructuredOutputNoObjectGeneratedError';
    }
}

export class StructuredOutputParseError extends StructuredOutputError {
    constructor(
        message: string,
        provider: string,
        options: StructuredOutputErrorOptions = {}
    ) {
        super(message, provider, options);
        this.name = 'StructuredOutputParseError';
    }
}

export class StructuredOutputValidationError extends StructuredOutputError {
    public readonly issues: string[];

    constructor(
        message: string,
        provider: string,
        issues: string[],
        options: StructuredOutputErrorOptions = {}
    ) {
        super(message, provider, options);
        this.name = 'StructuredOutputValidationError';
        this.issues = issues;
    }
}
