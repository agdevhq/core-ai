/**
 * How an endpoint reports reasoning tokens relative to its output-token total.
 * `included` (OpenAI): the output total already contains them. `separate`
 * (e.g. xAI Chat Completions): they are reported only in the details object.
 */
export type OpenAIReasoningTokenAccounting = 'included' | 'separate';

/** core-ai invariant: `outputTokens` always includes reasoning tokens. */
export function normalizeOutputTokens(
    outputTokens: number,
    reasoningTokens: number | undefined,
    accounting: OpenAIReasoningTokenAccounting = 'included'
): number {
    if (accounting === 'separate' && reasoningTokens !== undefined) {
        return outputTokens + reasoningTokens;
    }
    return outputTokens;
}
