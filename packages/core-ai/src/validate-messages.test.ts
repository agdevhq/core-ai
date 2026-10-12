import { describe, expect, it } from 'vitest';
import {
    UnsupportedInputModalityError,
    UnsupportedSystemMessagePlacementError,
} from './errors.ts';
import {
    TEXT_ONLY_MODALITIES,
    UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
} from './model-capabilities.ts';
import type { Message, ModelCapabilities } from './types.ts';
import { validateMessages } from './validate-messages.ts';

const capabilities: ModelCapabilities = {
    reasoning: {
        mode: 'unsupported',
        supportedEfforts: [],
        restrictsSamplingParams: false,
        supportedToolChoices: ['auto', 'none', 'required', 'tool'],
    },
    modalities: TEXT_ONLY_MODALITIES,
    tools: { strictSchemas: UNSUPPORTED_TOOL_SCHEMA_STRICTNESS },
    messages: { systemPlacement: 'leading' },
};

function validate(messages: Message[]) {
    validateMessages({
        messages,
        capabilities,
        modelId: 'test-model',
        providerId: 'test',
    });
}

describe('validateMessages', () => {
    it('should accept messages that pass every check', () => {
        expect(() =>
            validate([
                { role: 'system', content: 'Be brief.' },
                { role: 'user', content: 'Hi' },
            ])
        ).not.toThrow();
    });

    it('should reject unsupported input modalities', () => {
        expect(() =>
            validate([
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'url',
                                url: 'https://x.test/a.png',
                            },
                        },
                    ],
                },
            ])
        ).toThrowError(UnsupportedInputModalityError);
    });

    it('should reject misplaced system messages', () => {
        expect(() =>
            validate([
                { role: 'user', content: 'Hi' },
                { role: 'system', content: 'Be brief.' },
            ])
        ).toThrowError(UnsupportedSystemMessagePlacementError);
    });
});
