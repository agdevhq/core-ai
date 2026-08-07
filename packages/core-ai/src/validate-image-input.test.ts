import { describe, expect, it } from 'vitest';
import { ValidationError } from './errors.ts';
import type { Message, ModelCapabilities } from './types.ts';
import { validateImageInput } from './validate-image-input.ts';
import { MULTIMODAL_INPUT_MODALITIES, TEXT_ONLY_MODALITIES } from './model-capabilities.ts';

const REASONING: ModelCapabilities['reasoning'] = {
    mode: 'unsupported',
    supportedEfforts: [],
    restrictsSamplingParams: false,
    supportedToolChoices: ['auto', 'none', 'required', 'tool'],
};

const SUPPORTED: ModelCapabilities = {
    reasoning: REASONING,
    modalities: MULTIMODAL_INPUT_MODALITIES,
};

const UNSUPPORTED: ModelCapabilities = {
    reasoning: REASONING,
    modalities: TEXT_ONLY_MODALITIES,
};

const URL_IMAGE_MESSAGES: Message[] = [
    {
        role: 'user',
        content: [
            { type: 'text', text: 'What is this?' },
            {
                type: 'image',
                source: { type: 'url', url: 'https://example.com/cat.jpg' },
            },
        ],
    },
];

describe('validateImageInput', () => {
    it('accepts images when the model supports image input', () => {
        expect(() =>
            validateImageInput({
                messages: URL_IMAGE_MESSAGES,
                capabilities: SUPPORTED,
                modelId: 'model',
                providerId: 'openai',
            })
        ).not.toThrow();
    });

    it('rejects images when the model does not support image input', () => {
        expect(() =>
            validateImageInput({
                messages: URL_IMAGE_MESSAGES,
                capabilities: UNSUPPORTED,
                modelId: 'model',
                providerId: 'openai',
            })
        ).toThrowError(ValidationError);
    });

    it('ignores messages without images', () => {
        const messages: Message[] = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Plain string content' },
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Text part' },
                    {
                        type: 'file',
                        data: 'AAAA',
                        mimeType: 'application/pdf',
                    },
                ],
            },
            { role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] },
        ];

        expect(() =>
            validateImageInput({
                messages,
                capabilities: UNSUPPORTED,
                modelId: 'model',
                providerId: 'openai',
            })
        ).not.toThrow();
    });
});
