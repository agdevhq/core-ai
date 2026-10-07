import { describe, expect, it } from 'vitest';
import {
    UnsupportedSystemMessagePlacementError,
    ValidationError,
} from './errors.ts';
import {
    TEXT_ONLY_MODALITIES,
    UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
} from './model-capabilities.ts';
import type {
    Message,
    ModelCapabilities,
    SystemMessagePlacement,
} from './types.ts';
import { validateSystemMessagePlacement } from './validate-system-message-placement.ts';

function createCapabilities(
    systemPlacement: SystemMessagePlacement
): ModelCapabilities {
    return {
        reasoning: {
            mode: 'unsupported',
            supportedEfforts: [],
            restrictsSamplingParams: false,
            supportedToolChoices: ['auto', 'none', 'required', 'tool'],
        },
        modalities: TEXT_ONLY_MODALITIES,
        tools: { strictSchemas: UNSUPPORTED_TOOL_SCHEMA_STRICTNESS },
        messages: { systemPlacement },
    };
}

const LATER_SYSTEM_MESSAGES: Message[] = [
    { role: 'system', content: 'Be brief.' },
    { role: 'user', content: 'Hi' },
    { role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] },
    { role: 'system', content: 'Answer in one word.' },
    { role: 'user', content: 'How are you?' },
];

describe('validateSystemMessagePlacement', () => {
    it('should accept messages that follow the model rule', () => {
        expect(() =>
            validateSystemMessagePlacement({
                messages: LATER_SYSTEM_MESSAGES,
                capabilities: createCapabilities('anywhere'),
                modelId: 'model',
                providerId: 'openai',
            })
        ).not.toThrow();
    });

    it('should throw a typed error naming the message and the fix', () => {
        let error: unknown;
        try {
            validateSystemMessagePlacement({
                messages: LATER_SYSTEM_MESSAGES,
                capabilities: createCapabilities('before-reply'),
                modelId: 'claude-opus-5-5',
                providerId: 'anthropic',
            });
        } catch (caught) {
            error = caught;
        }

        expect(error).toBeInstanceOf(UnsupportedSystemMessagePlacementError);
        expect(error).toBeInstanceOf(ValidationError);
        const placementError = error as UnsupportedSystemMessagePlacementError;
        expect(placementError.provider).toBe('anthropic');
        expect(placementError.placement).toBe('before-reply');
        expect(placementError.issues).toEqual([
            { index: 3, reason: 'must-follow-user-or-tool' },
            { index: 3, reason: 'must-precede-assistant-or-end' },
        ]);
        expect(placementError.message).toBe(
            'anthropic model "claude-opus-5-5" accepts system messages after the first non-system message only directly after a user or tool message, followed by an assistant message or at the end (systemPlacement "before-reply"). ' +
                'Message 3 must directly follow a user or tool message: move it after the next user message. ' +
                'Message 3 must be the last message or be followed by an assistant message.'
        );
    });

    it('should explain the leading rule', () => {
        expect(() =>
            validateSystemMessagePlacement({
                messages: LATER_SYSTEM_MESSAGES,
                capabilities: createCapabilities('leading'),
                modelId: 'gemini-2.5-flash',
                providerId: 'google',
            })
        ).toThrowError(
            'google model "gemini-2.5-flash" accepts system messages only before the first non-system message (systemPlacement "leading"). ' +
                'Message 3 must move before the first non-system message, or be sent as a user message.'
        );
    });
});
