import { UnsupportedSystemMessagePlacementError } from './errors.ts';
import { getSystemMessagePlacementIssues } from './system-message-placement.ts';
import type { Message, ModelCapabilities } from './types.ts';

export type ValidateSystemMessagePlacementOptions = {
    messages: readonly Message[];
    capabilities: ModelCapabilities;
    modelId: string;
    providerId: string;
};

/**
 * Rejects system messages placed where
 * `capabilities.messages.systemPlacement` does not allow them, before any
 * provider request is made.
 */
export function validateSystemMessagePlacement({
    messages,
    capabilities,
    modelId,
    providerId,
}: ValidateSystemMessagePlacementOptions): void {
    const placement = capabilities.messages.systemPlacement;
    const issues = getSystemMessagePlacementIssues(messages, placement);
    if (issues.length === 0) {
        return;
    }

    throw new UnsupportedSystemMessagePlacementError({
        modelId,
        providerId,
        placement,
        issues,
    });
}
