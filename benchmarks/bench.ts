import { stream } from '@core-ai/core-ai';
import type {
    ChatModel,
    ChatUsage,
    FinishReason,
    ReasoningEffort,
} from '@core-ai/core-ai';

export type RunMetrics = {
    ttftMs: number;
    totalMs: number;
    /**
     * Decode throughput over the visible generation window. Undefined for
     * buffered/bursty streams that flush everything in a blink after TTFT —
     * there the window measures flush behavior, not decode speed.
     */
    genTokensPerSec: number | undefined;
    /** True when the gen rate is based on character-estimated tokens. */
    genRateEstimated: boolean;
    e2eTokensPerSec: number;
    outputTokens: number;
    reasoningTokens: number | undefined;
    /** True when the provider omitted stream usage and tokens were estimated. */
    tokensEstimated: boolean;
    finishReason: FinishReason;
};

export type RunOutcome =
    | { ok: true; metrics: RunMetrics }
    | { ok: false; error: string };

export async function measureRun(args: {
    model: ChatModel;
    prompt: string;
    maxTokens: number;
    timeoutMs: number;
    reasoningEffort?: ReasoningEffort;
}): Promise<RunOutcome> {
    const { model, prompt, maxTokens, timeoutMs, reasoningEffort } = args;
    try {
        const t0 = performance.now();
        let tFirst: number | undefined;
        let tLast = t0;
        let charCount = 0;
        let sawReasoningDeltas = false;
        let usage: ChatUsage | undefined;
        let finishReason: FinishReason = 'unknown';

        const chatStream = await stream({
            model,
            messages: [{ role: 'user', content: prompt }],
            maxTokens,
            ...(reasoningEffort !== undefined
                ? { reasoning: { effort: reasoningEffort } }
                : {}),
            signal: AbortSignal.timeout(timeoutMs),
        });

        for await (const event of chatStream) {
            if (
                (event.type === 'text-delta' ||
                    event.type === 'reasoning-delta') &&
                event.text.length > 0
            ) {
                const now = performance.now();
                tFirst ??= now;
                tLast = now;
                charCount += event.text.length;
                if (event.type === 'reasoning-delta') {
                    sawReasoningDeltas = true;
                }
            } else if (event.type === 'finish') {
                usage = event.usage;
                finishReason = event.finishReason;
            }
        }

        const tEnd = performance.now();
        if (tFirst === undefined) {
            return {
                ok: false,
                error:
                    'stream produced no text or reasoning deltas ' +
                    `(finish=${finishReason}, outputTokens=${usage?.outputTokens ?? 0}` +
                    `, reasoningTokens=${usage?.outputTokenDetails.reasoningTokens ?? 0})`,
            };
        }

        const reportedTokens = usage?.outputTokens ?? 0;
        const tokensEstimated = reportedTokens === 0;
        // ~4 chars per token; delta-event counts are unreliable because
        // providers batch multiple tokens per SSE chunk.
        const outputTokens = tokensEstimated
            ? Math.max(1, Math.round(charCount / 4))
            : reportedTokens;

        const totalMs = tEnd - t0;
        const e2eTokensPerSec = outputTokens / (totalMs / 1000);
        const genWindowMs = tLast - tFirst;
        // Hidden reasoning (tokens reported in usage but never streamed,
        // e.g. OpenAI Chat Completions) happens before the first visible
        // delta and belongs to TTFT, not the generation window.
        const hiddenReasoningTokens = sawReasoningDeltas
            ? 0
            : (usage?.outputTokenDetails.reasoningTokens ?? 0);
        let genTokens = Math.max(1, outputTokens - hiddenReasoningTokens);
        let genRateEstimated = tokensEstimated;
        // Some gateways hide thinking without reporting a reasoning
        // breakdown: usage then counts far more tokens than the visible
        // stream carried. Estimate streamed tokens from characters instead.
        const streamedEstimate = Math.max(1, Math.round(charCount / 4));
        if (
            !sawReasoningDeltas &&
            hiddenReasoningTokens === 0 &&
            outputTokens > streamedEstimate * 1.5
        ) {
            genTokens = streamedEstimate;
            genRateEstimated = true;
        }
        // The first token's latency belongs to TTFT, so throughput counts
        // the remaining tokens over the generation window. The rate is only
        // meaningful when the stream was reasonably steady: buffered
        // responses flush everything moments after the first delta, and the
        // tiny window would measure flush speed, not decode speed.
        const steadyWindow = genWindowMs >= Math.min(1000, totalMs * 0.5);
        const genTokensPerSec =
            steadyWindow && genTokens >= 2
                ? (genTokens - 1) / (genWindowMs / 1000)
                : undefined;

        return {
            ok: true,
            metrics: {
                ttftMs: tFirst - t0,
                totalMs,
                genTokensPerSec,
                genRateEstimated,
                e2eTokensPerSec,
                outputTokens,
                reasoningTokens: usage?.outputTokenDetails.reasoningTokens,
                tokensEstimated,
                finishReason,
            },
        };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export type Summary = {
    median: number;
    p95: number;
    min: number;
    max: number;
};

export function summarize(values: number[]): Summary {
    const sorted = [...values].sort((a, b) => a - b);
    return {
        median: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        min: sorted[0] ?? Number.NaN,
        max: sorted[sorted.length - 1] ?? Number.NaN,
    };
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) {
        return Number.NaN;
    }
    const index = (sorted.length - 1) * p;
    const lower = sorted[Math.floor(index)] ?? Number.NaN;
    const upper = sorted[Math.ceil(index)] ?? Number.NaN;
    return lower + (upper - lower) * (index - Math.floor(index));
}
