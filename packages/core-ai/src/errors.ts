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

/**
 * Stable machine-readable codes for provider API failures.
 * Prefer switching on `code` for serialization / cross-bundle checks;
 * use subclasses for typed metadata and same-process `instanceof`.
 */
export type ProviderErrorCode =
    | 'context_length_exceeded'
    | 'rate_limit_exceeded'
    | 'model_overloaded'
    | 'service_unavailable'
    | 'unknown';

export type ProviderErrorOptions = {
    code?: ProviderErrorCode;
    statusCode?: number;
    cause?: unknown;
};

export class ProviderError extends CoreAIError {
    public readonly code: ProviderErrorCode;
    public readonly statusCode?: number;

    /**
     * @param message Human-readable error message (may include provider text).
     * @param provider Provider id (e.g. `'openai'`, `'anthropic'`).
     * @param statusCodeOrOptions HTTP status, or options object.
     * @param cause Underlying error when using the legacy positional form.
     */
    constructor(
        message: string,
        provider: string,
        statusCodeOrOptions?: number | ProviderErrorOptions,
        cause?: unknown
    ) {
        const options = normalizeProviderErrorOptions(statusCodeOrOptions, cause);
        super(message, options.cause, provider);
        this.name = 'ProviderError';
        this.code = options.code ?? 'unknown';
        this.statusCode = options.statusCode;
    }

    /** True for transient capacity, rate-limit, or availability failures. */
    get isRetryable(): boolean {
        return (
            this.code === 'rate_limit_exceeded' ||
            this.code === 'model_overloaded' ||
            this.code === 'service_unavailable'
        );
    }
}

export type ContextLengthExceededErrorOptions = {
    statusCode?: number;
    cause?: unknown;
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
            code: 'context_length_exceeded',
            statusCode: options.statusCode,
            cause: options.cause,
        });
        this.name = 'ContextLengthExceededError';
        this.maxTokens = options.maxTokens;
        this.actualTokens = options.actualTokens;
    }
}

export type RateLimitErrorOptions = {
    statusCode?: number;
    cause?: unknown;
    retryAfterSeconds?: number;
};

export class RateLimitError extends ProviderError {
    public readonly retryAfterSeconds?: number;

    constructor(
        message: string,
        provider: string,
        options: RateLimitErrorOptions = {}
    ) {
        super(message, provider, {
            code: 'rate_limit_exceeded',
            statusCode: options.statusCode ?? 429,
            cause: options.cause,
        });
        this.name = 'RateLimitError';
        this.retryAfterSeconds = options.retryAfterSeconds;
    }
}

export type ModelOverloadedErrorOptions = {
    statusCode?: number;
    cause?: unknown;
};

export class ModelOverloadedError extends ProviderError {
    constructor(
        message: string,
        provider: string,
        options: ModelOverloadedErrorOptions = {}
    ) {
        super(message, provider, {
            code: 'model_overloaded',
            statusCode: options.statusCode,
            cause: options.cause,
        });
        this.name = 'ModelOverloadedError';
    }
}

export type ServiceUnavailableErrorOptions = {
    statusCode?: number;
    cause?: unknown;
};

export class ServiceUnavailableError extends ProviderError {
    constructor(
        message: string,
        provider: string,
        options: ServiceUnavailableErrorOptions = {}
    ) {
        super(message, provider, {
            code: 'service_unavailable',
            statusCode: options.statusCode,
            cause: options.cause,
        });
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

function normalizeProviderErrorOptions(
    statusCodeOrOptions?: number | ProviderErrorOptions,
    cause?: unknown
): ProviderErrorOptions {
    if (
        statusCodeOrOptions !== undefined &&
        typeof statusCodeOrOptions === 'object'
    ) {
        return statusCodeOrOptions;
    }

    return {
        statusCode: statusCodeOrOptions,
        cause,
    };
}
