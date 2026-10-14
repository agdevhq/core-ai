import { ValidationError } from './errors.ts';
import { isPlainObject } from './json-schema.ts';
import { getErrorMessage } from './provider-error-utils.ts';
import type { StandardSchemaV1, StandardTypedV1 } from './standard-schema.ts';
import type {
    InferSchemaOutput,
    JsonSchema,
    SchemaInput,
    StandardSchemaWithJson,
    ToolDefinition,
} from './types.ts';

/**
 * The single shape every schema takes once it enters core-ai. Adapters render
 * `jsonSchema`; `validate` is present only for Standard Schemas.
 *
 * `jsonSchema` may be shared between requests (see {@link normalizeSchema}),
 * so it must never be mutated.
 */
export type NormalizedSchema<TOutput = unknown> = {
    jsonSchema: JsonSchema;
    validate?: (
        value: unknown
    ) =>
        | StandardSchemaV1.Result<TOutput>
        | Promise<StandardSchemaV1.Result<TOutput>>;
};

const JSON_SCHEMA_TARGET = 'draft-2020-12';

/**
 * Normalized Standard Schemas, keyed by the schema object. Converting a schema
 * to JSON Schema walks the whole schema, and a tool definition is typically
 * reused across every request of a conversation.
 */
const normalizedSchemaCache = new WeakMap<object, NormalizedSchema>();

/**
 * Converts a schema into core-ai's internal shape:
 *
 * - a Standard Schema with JSON Schema support yields the JSON Schema of its
 *   input type (draft 2020-12), computed once per schema object, and its
 *   validator;
 * - plain JSON Schema is used as is, byte for byte, without a validator.
 *
 * `label` names the schema in errors, e.g. `tool "search" parameters`.
 *
 * @throws {ValidationError} for a Standard Schema without JSON Schema support,
 * a conversion that fails, or a value that is neither kind of schema.
 */
export function normalizeSchema<TSchema extends SchemaInput>(
    schema: TSchema,
    label = 'schema'
): NormalizedSchema<InferSchemaOutput<TSchema>> {
    if (isStandardSchema(schema)) {
        let normalized = normalizedSchemaCache.get(schema);
        if (normalized === undefined) {
            normalized = normalizeStandardSchema(schema, label);
            normalizedSchemaCache.set(schema, normalized);
        }
        // The cache is keyed by the schema object, whose validator produces
        // exactly this output type.
        return normalized as NormalizedSchema<InferSchemaOutput<TSchema>>;
    }

    if (isPlainObject(schema)) {
        return { jsonSchema: schema };
    }

    throw new ValidationError(
        `${label} must be a Standard Schema with JSON Schema support (e.g. a Zod 4.2+ schema) or a plain JSON Schema object`
    );
}

/**
 * Returns the JSON Schema core-ai derives from `schema`: the same conversion
 * it applies to tool parameters and structured output schemas before
 * adapters add their semantics-preserving provider transforms (e.g. for
 * strict tools). Use it to store or measure schemas.
 *
 * Returns a copy, so changing it never affects what core-ai sends.
 */
export function toJsonSchema(schema: SchemaInput): JsonSchema {
    return structuredClone(normalizeSchema(schema).jsonSchema);
}

/** The JSON Schema of a tool's parameters, as adapters send it. */
export function getToolJsonSchema(tool: ToolDefinition): JsonSchema {
    return normalizeSchema(tool.parameters, getToolParametersLabel(tool))
        .jsonSchema;
}

/** The normalized parameters of a tool. */
export function normalizeToolParameters(
    tool: ToolDefinition
): NormalizedSchema {
    return normalizeSchema(tool.parameters, getToolParametersLabel(tool));
}

function getToolParametersLabel(tool: ToolDefinition): string {
    return `tool "${tool.name}" parameters`;
}

/**
 * Whether `value` carries Standard Schema properties. ArkType schemas are
 * functions, so functions qualify too. It does not check for a validator or
 * JSON Schema support; {@link normalizeSchema} does.
 */
export function isStandardSchema(value: unknown): value is StandardTypedV1 {
    return (
        (typeof value === 'object' || typeof value === 'function') &&
        value !== null &&
        '~standard' in value
    );
}

function normalizeStandardSchema(
    schema: StandardTypedV1,
    label: string
): NormalizedSchema {
    const props: Partial<StandardSchemaWithJson['~standard']> =
        schema['~standard'];
    const vendor = typeof props.vendor === 'string' ? props.vendor : 'unknown';

    if (
        typeof props.jsonSchema?.input !== 'function' ||
        typeof props.validate !== 'function'
    ) {
        throw new ValidationError(
            `${label} is a Standard Schema (vendor "${vendor}") without Standard JSON Schema support. Use a library version that implements Standard JSON Schema (e.g. Zod 4.2+, not zod/mini), or pass plain JSON Schema instead.`
        );
    }

    const validate = props.validate.bind(props);
    let jsonSchema: unknown;
    try {
        jsonSchema = props.jsonSchema.input({ target: JSON_SCHEMA_TARGET });
    } catch (error) {
        throw new ValidationError(
            `${label} cannot be converted to JSON Schema (vendor "${vendor}"): ${getErrorMessage(error)}`,
            error
        );
    }

    if (!isPlainObject(jsonSchema)) {
        throw new ValidationError(
            `${label} produced a JSON Schema that is not an object (vendor "${vendor}")`
        );
    }

    return { jsonSchema, validate };
}
