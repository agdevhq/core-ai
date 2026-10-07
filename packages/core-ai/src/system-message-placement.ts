import type { Message, SystemMessagePlacement } from './types.ts';

export type SystemMessagePlacementIssueReason =
    | 'not-leading'
    | 'must-follow-user-or-tool'
    | 'must-precede-assistant-or-end';

export type SystemMessagePlacementIssue = {
    /** Index of the offending system message in `messages`. */
    index: number;
    reason: SystemMessagePlacementIssueReason;
};

/**
 * Returns the system messages that break `placement`, without throwing.
 * Use it to check a conversation before sending, or against a stricter
 * rule than the current model's to stay portable across models.
 */
export function getSystemMessagePlacementIssues(
    messages: readonly Message[],
    placement: SystemMessagePlacement
): SystemMessagePlacementIssue[] {
    if (placement === 'anywhere') {
        return [];
    }

    const issues: SystemMessagePlacementIssue[] = [];
    let index = messages.findIndex((message) => message.role !== 'system');
    if (index === -1) {
        return issues;
    }

    while (index < messages.length) {
        if (messages[index]?.role !== 'system') {
            index++;
            continue;
        }

        const start = index;
        while (messages[index]?.role === 'system') {
            index++;
        }

        const runReasons = getRunReasons(
            messages[start - 1],
            messages[index],
            placement
        );
        for (let runIndex = start; runIndex < index; runIndex++) {
            for (const reason of runReasons) {
                issues.push({ index: runIndex, reason });
            }
        }
    }

    return issues;
}

/**
 * Reasons why a run of consecutive later system messages breaks
 * `placement`, given the messages around the run.
 */
function getRunReasons(
    previous: Message | undefined,
    next: Message | undefined,
    placement: Exclude<SystemMessagePlacement, 'anywhere'>
): SystemMessagePlacementIssueReason[] {
    if (placement === 'leading') {
        return ['not-leading'];
    }

    const reasons: SystemMessagePlacementIssueReason[] = [];
    if (previous?.role !== 'user' && previous?.role !== 'tool') {
        reasons.push('must-follow-user-or-tool');
    }
    if (next !== undefined && next.role !== 'assistant') {
        reasons.push('must-precede-assistant-or-end');
    }
    return reasons;
}
