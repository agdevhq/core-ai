import { getErrorMessage } from './provider-error-utils.ts';
import { normalizeToolParameters } from './schema.ts';
import type { StandardSchemaV1 } from './standard-schema.ts';
import type {
    GenerateOptions,
    GenerateResult,
    StreamEvent,
    ToolCall,
    ToolSet,
} from './types.ts';

/** The parts of a request that shape how its response is finalized. */
export type FinalizeResultRequest = Pick<GenerateOptions, 'tools'>;

/**
 * Validates the tool calls of a provider response, setting
 * `ToolCall.validation` on every call whose tool has Standard Schema
 * parameters. Adapters that build a `GenerateResult` themselves call this
 * before returning it; streamed results get the same treatment from
 * `createChatStream`.
 */
export async function finalizeGenerateResult(
    result: GenerateResult,
    request: FinalizeResultRequest
): Promise<GenerateResult> {
    const validatedCalls = new Map<ToolCall, ToolCall>();
    const validate = async (toolCall: ToolCall): Promise<ToolCall> => {
        let validated = validatedCalls.get(toolCall);
        if (validated === undefined) {
            validated = await validateToolCall(toolCall, request.tools);
            validatedCalls.set(toolCall, validated);
        }
        return validated;
    };

    const parts: GenerateResult['parts'] = [];
    for (const part of result.parts) {
        parts.push(
            part.type === 'tool-call'
                ? { ...part, toolCall: await validate(part.toolCall) }
                : part
        );
    }

    const toolCalls: ToolCall[] = [];
    for (const toolCall of result.toolCalls) {
        toolCalls.push(await validate(toolCall));
    }

    return { ...result, parts, toolCalls };
}

/**
 * The streaming counterpart of {@link finalizeGenerateResult}: validates each
 * call when it completes (`tool-call-end`).
 */
export async function* finalizeStreamEvents(
    events: AsyncIterable<StreamEvent>,
    request: FinalizeResultRequest
): AsyncIterable<StreamEvent> {
    for await (const event of events) {
        if (event.type === 'tool-call-end') {
            yield {
                ...event,
                toolCall: await validateToolCall(event.toolCall, request.tools),
            };
            continue;
        }
        yield event;
    }
}

async function validateToolCall(
    toolCall: ToolCall,
    tools: ToolSet | undefined
): Promise<ToolCall> {
    const tool =
        tools &&
        Object.values(tools).find(
            (candidate) => candidate.name === toolCall.name
        );
    const validate = tool && normalizeToolParameters(tool).validate;
    if (!validate) {
        return toolCall;
    }

    let validation: StandardSchemaV1.Result<unknown>;
    try {
        validation = await validate(toolCall.arguments);
    } catch (error) {
        // A validator that throws (e.g. a transform calling `new URL()`) is
        // reported like any other failure instead of failing the response.
        validation = {
            issues: [
                { message: `validation threw: ${getErrorMessage(error)}` },
            ],
        };
    }

    return { ...toolCall, validation };
}
