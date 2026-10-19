import { ValidationError } from './errors.ts';
import { getErrorMessage } from './provider-error-utils.ts';
import { normalizeToolParameters } from './schema.ts';
import type { StandardSchemaV1 } from './standard-schema.ts';
import type {
    InferSchemaOutput,
    SchemaInput,
    ToolCall,
    ToolDefinition,
} from './types.ts';

export function defineTool<TParameters extends ToolDefinition['parameters']>(
    options: ToolDefinition<TParameters>
): ToolDefinition<TParameters> {
    return options;
}

/**
 * Tool names every provider accepts (live-verified: OpenAI and Anthropic
 * allow only these characters, Gemini requires a leading letter or
 * underscore, and OpenAI, Anthropic, and Gemini allow at most 128
 * characters).
 */
export const PORTABLE_TOOL_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]{0,127}$/;

const MAX_TOOL_NAME_LENGTH = 128;

/**
 * Returns a tool name every provider accepts. A valid name is returned
 * unchanged. Any other name has each character outside letters, digits,
 * underscores, and dashes replaced with `_`, gets a leading `_` unless it
 * starts with a letter or underscore, and ends with `_` and a hash of the
 * original name, truncated so the result has at most 128 characters.
 *
 * The result depends only on `name`, so it is stable across requests and
 * catalog changes, and the hash keeps names apart that would otherwise
 * convert to the same one (`a.b` and `a:b`). Keep a map from the result to
 * the original name to translate calls back.
 */
export function toPortableToolName(name: string): string {
    if (PORTABLE_TOOL_NAME_PATTERN.test(name)) {
        return name;
    }

    const suffix = `_${hashToolName(name)}`;
    const replaced = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const base = /^[a-zA-Z_]/.test(replaced) ? replaced : `_${replaced}`;
    return `${base.slice(0, MAX_TOOL_NAME_LENGTH - suffix.length)}${suffix}`;
}

/** 32-bit FNV-1a over the UTF-8 bytes of `name`, in base 36. */
function hashToolName(name: string): string {
    let hash = 0x811c9dc5;
    for (const byte of new TextEncoder().encode(name)) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36).padStart(7, '0');
}

/**
 * The result of {@link validateToolCall}: the schema's result for Standard
 * Schema parameters, `undefined` for plain JSON Schema.
 */
export type ToolCallValidation<TParameters extends SchemaInput> =
    TParameters extends StandardSchemaV1
        ? StandardSchemaV1.Result<InferSchemaOutput<TParameters>>
        : undefined;

/**
 * Validates the arguments of a call to `tool` with the tool's Standard
 * Schema and returns its result: `{ value }` with the schema's output, or
 * `{ issues }`. A validator that throws, such as a transform calling
 * `new URL()`, is reported as an issue too. Plain JSON Schema parameters have
 * no validator, so the result is `undefined`: validate those arguments
 * yourself.
 *
 * @throws {ValidationError} when `toolCall` is a call to another tool, or the
 * tool's parameters are not a usable schema (a request would fail on them too).
 */
export async function validateToolCall<TParameters extends SchemaInput>(
    tool: ToolDefinition<TParameters>,
    toolCall: ToolCall
): Promise<ToolCallValidation<TParameters>> {
    if (toolCall.name !== tool.name) {
        throw new ValidationError(
            `tool call "${toolCall.name}" cannot be validated against tool "${tool.name}"`
        );
    }

    const { validate } = normalizeToolParameters(tool);
    let result: StandardSchemaV1.Result<unknown> | undefined;
    if (validate) {
        try {
            result = await validate(toolCall.arguments);
        } catch (error) {
            result = {
                issues: [
                    { message: `validation threw: ${getErrorMessage(error)}` },
                ],
            };
        }
    }

    // Only Standard Schema parameters have a validator, and it produces their
    // output type.
    return result as ToolCallValidation<TParameters>;
}
