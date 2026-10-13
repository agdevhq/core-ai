import {
    StructuredOutputParseError,
    StructuredOutputValidationError,
} from './errors.ts';
import { normalizeSchema, type NormalizedSchema } from './schema.ts';
import type { StandardSchemaV1 } from './standard-schema.ts';
import type {
    GenerateObjectOptions,
    InferSchemaOutput,
    SchemaInput,
} from './types.ts';

/** The normalized schema of a `generateObject` / `streamObject` request. */
export function normalizeStructuredOutputSchema<TSchema extends SchemaInput>(
    options: Pick<GenerateObjectOptions<TSchema>, 'schema' | 'schemaName'>
): NormalizedSchema<InferSchemaOutput<TSchema>> {
    const name = options.schemaName?.trim();
    return normalizeSchema(
        options.schema,
        name ? `structured output schema "${name}"` : 'structured output schema'
    );
}

/**
 * Parses a structured output payload as JSON and validates it with
 * {@link validateStructuredOutput}.
 *
 * @throws {StructuredOutputParseError} when the payload is not valid JSON.
 * @throws {StructuredOutputValidationError} when validation fails.
 */
export async function parseStructuredOutput<TOutput>(
    schema: NormalizedSchema<TOutput>,
    rawOutput: string,
    provider: string
): Promise<TOutput> {
    let value: unknown;
    try {
        value = JSON.parse(rawOutput);
    } catch (error) {
        throw new StructuredOutputParseError(
            'failed to parse structured output as JSON',
            provider,
            {
                rawOutput,
                cause: error,
            }
        );
    }

    return validateStructuredOutput(schema, value, provider, rawOutput);
}

/**
 * Validates a structured output value with the schema's own validator and
 * returns the schema's output. Plain JSON Schema has no validator, so the
 * value is returned unchanged for the caller to validate.
 *
 * @throws {StructuredOutputValidationError} when validation fails.
 */
export async function validateStructuredOutput<TOutput>(
    schema: NormalizedSchema<TOutput>,
    value: unknown,
    provider: string,
    rawOutput?: string
): Promise<TOutput> {
    if (!schema.validate) {
        // Only plain JSON Schema lacks a validator, and its output type is
        // `unknown`.
        return value as TOutput;
    }

    const result = await schema.validate(value);
    if (result.issues === undefined) {
        return result.value;
    }

    throw new StructuredOutputValidationError(
        'structured output does not match schema',
        provider,
        formatSchemaIssues(result.issues),
        {
            rawOutput,
        }
    );
}

/** Formats Standard Schema issues as `path.to.key: message`. */
export function formatSchemaIssues(
    issues: readonly StandardSchemaV1.Issue[]
): string[] {
    return issues.map((issue) => {
        const path =
            issue.path && issue.path.length > 0
                ? issue.path
                      .map((segment) =>
                          String(
                              typeof segment === 'object'
                                  ? segment.key
                                  : segment
                          )
                      )
                      .join('.')
                : '<root>';
        return `${path}: ${issue.message}`;
    });
}
