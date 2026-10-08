import { describe, expect, it } from 'vitest';
import { getSystemMessagePlacementIssues } from './system-message-placement.ts';
import type { Message, SystemMessagePlacement } from './types.ts';

const system: Message = { role: 'system', content: 'Be brief.' };
const user: Message = { role: 'user', content: 'Hi' };
const assistant: Message = { role: 'assistant', parts: [] };
const tool: Message = {
    role: 'tool',
    toolCallId: 'call_1',
    content: 'done',
};

describe('getSystemMessagePlacementIssues', () => {
    it('should accept leading system messages under every rule', () => {
        const messages = [system, system, user];

        for (const placement of [
            'leading',
            'before-reply',
            'anywhere',
        ] as const) {
            expect(
                getSystemMessagePlacementIssues(messages, placement)
            ).toEqual([]);
        }
    });

    it('should reject every later system message under leading', () => {
        expect(
            getSystemMessagePlacementIssues(
                [system, user, system, system, assistant],
                'leading'
            )
        ).toEqual([
            { index: 2, reason: 'not-leading' },
            { index: 3, reason: 'not-leading' },
        ]);
    });

    it.each<[string, Message[]]>([
        ['after a user message, last', [user, assistant, user, system]],
        ['after a tool message, last', [user, assistant, tool, system]],
        ['before an assistant message', [user, system, assistant, user]],
        ['as a run of system messages', [user, system, system]],
        ['after a leading run', [system, user, system]],
    ])(
        'should accept a system message %s under before-reply',
        (_, messages) => {
            expect(
                getSystemMessagePlacementIssues(messages, 'before-reply')
            ).toEqual([]);
        }
    );

    it('should reject a system message after an assistant message', () => {
        expect(
            getSystemMessagePlacementIssues(
                [user, assistant, system, assistant],
                'before-reply'
            )
        ).toEqual([{ index: 2, reason: 'must-follow-user-or-tool' }]);
    });

    it('should reject a system message at the end after an assistant message', () => {
        expect(
            getSystemMessagePlacementIssues(
                [user, assistant, system],
                'before-reply'
            )
        ).toEqual([{ index: 2, reason: 'must-follow-user-or-tool' }]);
    });

    it('should reject a system message followed by a user message', () => {
        expect(
            getSystemMessagePlacementIssues(
                [user, system, user],
                'before-reply'
            )
        ).toEqual([{ index: 1, reason: 'must-precede-assistant-or-end' }]);
    });

    it('should report both reasons for every message in an invalid run', () => {
        expect(
            getSystemMessagePlacementIssues(
                [user, assistant, system, system, user],
                'before-reply'
            )
        ).toEqual([
            { index: 2, reason: 'must-follow-user-or-tool' },
            { index: 2, reason: 'must-precede-assistant-or-end' },
            { index: 3, reason: 'must-follow-user-or-tool' },
            { index: 3, reason: 'must-precede-assistant-or-end' },
        ]);
    });

    it('should accept any position under anywhere', () => {
        expect(
            getSystemMessagePlacementIssues(
                [user, assistant, system, user, system],
                'anywhere'
            )
        ).toEqual([]);
    });

    it('should never reject under a looser rule what a stricter rule accepts', () => {
        const conversations: Message[][] = [
            [system, user],
            [user, system],
            [user, system, assistant, user],
            [user, assistant, system, user],
            [user, system, user],
            [system, user, assistant, system],
        ];
        const rules: SystemMessagePlacement[] = [
            'leading',
            'before-reply',
            'anywhere',
        ];

        for (const messages of conversations) {
            const valid = rules.map(
                (rule) =>
                    getSystemMessagePlacementIssues(messages, rule).length === 0
            );
            expect(valid).toEqual([...valid].sort());
        }
    });
});
