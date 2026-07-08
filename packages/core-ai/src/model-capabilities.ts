import type { ReasoningEffort } from './types.ts';

const EFFORT_RANK: Record<ReasoningEffort, number> = {
    minimal: 0,
    low: 1,
    medium: 2,
    high: 3,
    max: 4,
};

export function clampReasoningEffort(
    effort: ReasoningEffort,
    supportedEfforts: readonly ReasoningEffort[]
): ReasoningEffort {
    if (supportedEfforts.includes(effort)) {
        return effort;
    }

    const [firstSupportedEffort, ...remainingSupportedEfforts] =
        supportedEfforts;
    if (firstSupportedEffort === undefined) {
        return effort;
    }

    const targetRank = EFFORT_RANK[effort];
    let best = firstSupportedEffort;
    let bestDistance = Math.abs(EFFORT_RANK[best] - targetRank);

    for (const candidate of remainingSupportedEfforts) {
        const distance = Math.abs(EFFORT_RANK[candidate] - targetRank);
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    }

    return best;
}
