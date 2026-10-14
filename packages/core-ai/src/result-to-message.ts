import type { AssistantMessage, GenerateResult } from './types.ts';

export type ResultToMessageOptions = {
    includeReasoning?: boolean;
};

export function resultToMessage(
    result: GenerateResult,
    options?: ResultToMessageOptions
): AssistantMessage {
    const includeReasoning = options?.includeReasoning ?? true;
    const parts = includeReasoning
        ? [...result.parts]
        : result.parts.filter((part) => part.type !== 'reasoning');

    return {
        role: 'assistant',
        parts,
    };
}

export function assistantMessage(content: string): AssistantMessage {
    return {
        role: 'assistant',
        parts: [{ type: 'text', text: content }],
    };
}
