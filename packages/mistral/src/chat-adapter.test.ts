import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool, type Message, type ToolSet } from '@core-ai/core-ai';
import {
    convertMessages,
    convertToolChoice,
    convertTools,
} from './chat-adapter.js';

describe('convertMessages', () => {
    it('should convert system and user text messages', () => {
        const messages: Message[] = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
        ];

        expect(convertMessages(messages)).toEqual([
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
        ]);
    });

    it('should convert user image and file content', () => {
        const messages: Message[] = [
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Analyze this' },
                    {
                        type: 'image',
                        source: {
                            type: 'url',
                            url: 'https://example.com/image.png',
                        },
                    },
                    {
                        type: 'file',
                        data: 'base64-file',
                        mimeType: 'application/pdf',
                        filename: 'document.pdf',
                    },
                ],
            },
        ];

        expect(convertMessages(messages)).toEqual([
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Analyze this' },
                    {
                        type: 'image_url',
                        imageUrl: {
                            url: 'https://example.com/image.png',
                        },
                    },
                    {
                        type: 'document_url',
                        documentUrl: 'data:application/pdf;base64,base64-file',
                        documentName: 'document.pdf',
                    },
                ],
            },
        ]);
    });

    it('should convert assistant tool calls', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                content: null,
                toolCalls: [
                    {
                        id: 'tc_1',
                        name: 'search',
                        arguments: { query: 'weather' },
                    },
                ],
            },
        ];

        expect(convertMessages(messages)).toEqual([
            {
                role: 'assistant',
                content: null,
                toolCalls: [
                    {
                        id: 'tc_1',
                        type: 'function',
                        function: {
                            name: 'search',
                            arguments: { query: 'weather' },
                        },
                    },
                ],
            },
        ]);
    });

    it('should convert tool result messages', () => {
        const messages: Message[] = [
            {
                role: 'tool',
                toolCallId: 'tc_1',
                content: 'Sunny',
            },
        ];

        expect(convertMessages(messages)).toEqual([
            {
                role: 'tool',
                toolCallId: 'tc_1',
                content: 'Sunny',
            },
        ]);
    });
});

describe('convertTools', () => {
    it('should convert tool schema to mistral tool format', () => {
        const tools: ToolSet = {
            search: defineTool({
                name: 'search',
                description: 'Search the web',
                parameters: z.object({
                    query: z.string(),
                }),
            }),
        };

        const result = convertTools(tools);
        expect(result[0]?.type).toBe('function');
        expect(result[0]?.function.name).toBe('search');
        expect(result[0]?.function.description).toBe('Search the web');
        expect(result[0]?.function.parameters).toMatchObject({
            type: 'object',
            properties: {
                query: { type: 'string' },
            },
        });
    });
});

describe('convertToolChoice', () => {
    it('should pass through string choices', () => {
        expect(convertToolChoice('auto')).toBe('auto');
        expect(convertToolChoice('none')).toBe('none');
        expect(convertToolChoice('required')).toBe('required');
    });

    it('should convert specific tool choice', () => {
        expect(
            convertToolChoice({
                type: 'tool',
                toolName: 'search',
            })
        ).toEqual({
            type: 'function',
            function: { name: 'search' },
        });
    });
});
