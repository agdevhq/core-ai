import { describe, expect, it } from 'vitest';
import { ValidationError } from './errors.ts';
import type { Message, ModelCapabilities } from './types.ts';
import { validateImageInput } from './validate-image-input.ts';

const REASONING: ModelCapabilities['reasoning'] = {
    mode: 'unsupported',
    supportedEfforts: [],
    restrictsSamplingParams: false,
    supportedToolChoices: ['auto', 'none', 'required', 'tool'],
};

const SUPPORTED: ModelCapabilities = {
    reasoning: REASONING,
    modalities: {
        imageInput: { supported: true, supportedSources: ['base64', 'url'] },
    },
};

const BASE64_ONLY: ModelCapabilities = {
    reasoning: REASONING,
    modalities: {
        imageInput: { supported: true, supportedSources: ['base64'] },
    },
};

const UNSUPPORTED: ModelCapabilities = {
    reasoning: REASONING,
    modalities: {
        imageInput: { supported: false, supportedSources: [] },
    },
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
    it('accepts images when the model supports the source', () => {
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

    it('rejects image sources the model does not support', () => {
        expect(() =>
            validateImageInput({
                messages: URL_IMAGE_MESSAGES,
                capabilities: BASE64_ONLY,
                modelId: 'model',
                providerId: 'openai',
            })
        ).toThrowError(/does not support "url" image sources/);

        expect(() =>
            validateImageInput({
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    mediaType: 'image/jpeg',
                                    data: 'AAAA',
                                },
                            },
                        ],
                    },
                ],
                capabilities: BASE64_ONLY,
                modelId: 'model',
                providerId: 'openai',
            })
        ).not.toThrow();
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
