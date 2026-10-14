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
