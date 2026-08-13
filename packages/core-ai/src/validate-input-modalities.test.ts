import { describe, expect, it } from 'vitest';
import { UnsupportedInputModalityError } from './errors.ts';
import {
    MULTIMODAL_INPUT_MODALITIES,
    TEXT_ONLY_MODALITIES,
    UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
} from './model-capabilities.ts';
import type { Message, ModelCapabilities } from './types.ts';
import { validateInputModalities } from './validate-input-modalities.ts';

const REASONING: ModelCapabilities['reasoning'] = {
    mode: 'unsupported',
    supportedEfforts: [],
    restrictsSamplingParams: false,
    supportedToolChoices: ['auto', 'none', 'required', 'tool'],
};

const MULTIMODAL: ModelCapabilities = {
    reasoning: REASONING,
    modalities: MULTIMODAL_INPUT_MODALITIES,
    tools: { strictSchemas: UNSUPPORTED_TOOL_SCHEMA_STRICTNESS },
};

const TEXT_ONLY: ModelCapabilities = {
    reasoning: REASONING,
    modalities: TEXT_ONLY_MODALITIES,
    tools: { strictSchemas: UNSUPPORTED_TOOL_SCHEMA_STRICTNESS },
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

const FILE_MESSAGES: Message[] = [
    {
        role: 'user',
        content: [
            { type: 'text', text: 'Summarize this' },
            {
                type: 'file',
                data: 'AAAA',
                mimeType: 'application/pdf',
                filename: 'doc.pdf',
            },
        ],
    },
];

const AUDIO_MESSAGES: Message[] = [
    {
        role: 'user',
        content: [
            { type: 'text', text: 'Transcribe this' },
            {
                type: 'audio',
                source: {
                    type: 'base64',
                    mediaType: 'audio/wav',
                    data: 'UklGRg==',
                },
            },
        ],
    },
];

describe('validateInputModalities', () => {
    it('accepts images and files when the model is multimodal', () => {
        expect(() =>
            validateInputModalities({
                messages: [...URL_IMAGE_MESSAGES, ...FILE_MESSAGES],
                capabilities: MULTIMODAL,
                modelId: 'model',
                providerId: 'openai',
            })
        ).not.toThrow();
    });

    it('rejects images when the model is text-only', () => {
        expect(() =>
            validateInputModalities({
                messages: URL_IMAGE_MESSAGES,
                capabilities: TEXT_ONLY,
                modelId: 'model',
                providerId: 'openai',
            })
        ).toThrowError(UnsupportedInputModalityError);
    });

    it('rejects files when the model is text-only', () => {
        expect(() =>
            validateInputModalities({
                messages: FILE_MESSAGES,
                capabilities: TEXT_ONLY,
                modelId: 'model',
                providerId: 'openai',
            })
        ).toThrowError(UnsupportedInputModalityError);
    });

    it('accepts audio when the model advertises audio input', () => {
        const audioCapabilities: ModelCapabilities = {
            reasoning: REASONING,
            modalities: {
                input: ['text', 'audio'],
                output: ['text'],
            },
            tools: { strictSchemas: UNSUPPORTED_TOOL_SCHEMA_STRICTNESS },
        };

        expect(() =>
            validateInputModalities({
                messages: AUDIO_MESSAGES,
                capabilities: audioCapabilities,
                modelId: 'audio-model',
                providerId: 'provider',
            })
        ).not.toThrow();
    });

    it('rejects audio with structured modality details', () => {
        try {
            validateInputModalities({
                messages: AUDIO_MESSAGES,
                capabilities: TEXT_ONLY,
                modelId: 'text-model',
                providerId: 'provider',
            });
            expect.unreachable();
        } catch (error) {
            expect(error).toBeInstanceOf(UnsupportedInputModalityError);
            const modalityError = error as UnsupportedInputModalityError;
            expect(modalityError.unsupportedModalities).toEqual(['audio']);
            expect(modalityError.supportedModalities).toEqual(['text']);
            expect(modalityError.requestedModalities).toEqual([
                'text',
                'audio',
            ]);
            expect(modalityError.provider).toBe('provider');
        }
    });

    it('reports every unsupported modality in one error', () => {
        const messages: Message[] = [
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Look at these' },
                    {
                        type: 'image',
                        source: {
                            type: 'url',
                            url: 'https://example.com/cat.jpg',
                        },
                    },
                    {
                        type: 'file',
                        data: 'AAAA',
                        mimeType: 'application/pdf',
                    },
                ],
            },
        ];

        try {
            validateInputModalities({
                messages,
                capabilities: TEXT_ONLY,
                modelId: 'gpt-3.5-turbo',
                providerId: 'openai',
            });
            expect.unreachable();
        } catch (error) {
            expect(error).toBeInstanceOf(UnsupportedInputModalityError);
            const modalityError = error as UnsupportedInputModalityError;
            expect(modalityError.message).toBe(
                'openai model "gpt-3.5-turbo" does not support input modalities: image, file. Supported: text'
            );
            expect(modalityError.unsupportedModalities).toEqual([
                'image',
                'file',
            ]);
            expect(modalityError.supportedModalities).toEqual(['text']);
            expect(modalityError.requestedModalities).toEqual([
                'text',
                'image',
                'file',
            ]);
            expect(modalityError.provider).toBe('openai');
        }
    });

    it('allows text-only messages on text-only models', () => {
        const messages: Message[] = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Plain string content' },
            {
                role: 'user',
                content: [{ type: 'text', text: 'Text part' }],
            },
            { role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] },
        ];

        expect(() =>
            validateInputModalities({
                messages,
                capabilities: TEXT_ONLY,
                modelId: 'model',
                providerId: 'openai',
            })
        ).not.toThrow();
    });
});
