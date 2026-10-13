import type {
    AssistantContentPart,
    AssistantMessage,
    GenerateResult,
} from './types.ts';

export type ResultToMessageOptions = {
    includeReasoning?: boolean;
};

export function resultToMessage(
    result: GenerateResult,
    options?: ResultToMessageOptions
): AssistantMessage {
    const includeReasoning = options?.includeReasoning ?? true;
    const parts = includeReasoning
        ? result.parts
        : result.parts.filter((part) => part.type !== 'reasoning');

    return {
        role: 'assistant',
        parts: parts.map(toReplayablePart),
    };
}

/**
 * Tool call validation holds the schema's output, which may not be plain
 * data, so it stays on the result and out of the replayable message.
 */
function toReplayablePart(part: AssistantContentPart): AssistantContentPart {
    if (part.type !== 'tool-call' || part.toolCall.validation === undefined) {
        return part;
    }

    const { validation: _validation, ...toolCall } = part.toolCall;
    return { ...part, toolCall };
}

export function assistantMessage(content: string): AssistantMessage {
    return {
        role: 'assistant',
        parts: [{ type: 'text', text: content }],
    };
}
