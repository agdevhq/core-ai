export class LLMError extends Error {
    public readonly cause?: unknown;

    constructor(message: string, cause?: unknown) {
        super(message);
        this.name = 'LLMError';
        this.cause = cause;
    }
}

export class StreamAbortedError extends LLMError {
    constructor(message = 'stream aborted', cause?: unknown) {
        super(message, cause);
        this.name = 'StreamAbortedError';
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

type StructuredOutputErrorOptions = {
    statusCode?: number;
    cause?: unknown;
    rawOutput?: string;
};

export class StructuredOutputError extends ProviderError {
    public readonly rawOutput?: string;

    constructor(
        message: string,
        provider: string,
        options: StructuredOutputErrorOptions = {}
    ) {
        super(message, provider, options.statusCode, options.cause);
        this.name = 'StructuredOutputError';
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
