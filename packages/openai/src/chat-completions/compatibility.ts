export function extractCompatibleReasoningText(
    source: object
): string | undefined {
    const { reasoning_content, reasoning } = source as {
        reasoning_content?: unknown;
        reasoning?: unknown;
    };

    if (typeof reasoning_content === 'string' && reasoning_content.length > 0) {
        return reasoning_content;
    }
    if (typeof reasoning === 'string' && reasoning.length > 0) {
        return reasoning;
    }
    return undefined;
}
