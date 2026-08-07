import type {
    ChatInputModality,
    ChatOutputModality,
    ModelCapabilities,
    ReasoningEffort,
} from './types.ts';

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

/** Text in, text out — the default chat modality profile. */
export const TEXT_ONLY_MODALITIES = {
    input: ['text'],
    output: ['text'],
} as const satisfies ModelCapabilities['modalities'];

/**
 * Text, image, and file in; text out.
 *
 * Typical vision / document chat models. `'audio'` and `'video'` stay reserved
 * on `ChatInputModality` until dedicated user content parts exist.
 */
export const MULTIMODAL_INPUT_MODALITIES = {
    input: ['text', 'image', 'file'],
    output: ['text'],
} as const satisfies ModelCapabilities['modalities'];

export function supportsInputModality(
    capabilities: ModelCapabilities,
    modality: ChatInputModality
): boolean {
    return capabilities.modalities.input.includes(modality);
}

export function supportsOutputModality(
    capabilities: ModelCapabilities,
    modality: ChatOutputModality
): boolean {
    return capabilities.modalities.output.includes(modality);
}
