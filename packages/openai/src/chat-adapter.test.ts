import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    convertMessages,
    convertToolChoice,
    convertTools,
} from './chat-adapter.js';
import { defineTool, type Message, type ToolSet } from '@core-ai/core-ai';

describe('convertMessages', () => {
    it('should convert a system message', () => {
        const messages: Message[] = [
            { role: 'system', content: 'You are helpful.' },
        ];

        expect(convertMessages(messages)).toEqual([
            { role: 'system', content: 'You are helpful.' },
        ]);
    });

    it('should convert a simple user message', () => {
        const messages: Message[] = [{ role: 'user', content: 'Hello' }];

        expect(convertMessages(messages)).toEqual([
            { role: 'user', content: 'Hello' },
        ]);
    });

    it('should convert a user message with image URL', () => {
        const messages: Message[] = [
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'What is this?' },
                    {
                        type: 'image',
                        source: {
                            type: 'url',
                            url: 'https://example.com/img.png',
                        },
                    },
                ],
            },
        ];

        expect(convertMessages(messages)).toEqual([
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'What is this?' },
                    {
                        type: 'image_url',
                        image_url: { url: 'https://example.com/img.png' },
                    },
                ],
            },
        ]);
    });

    it('should convert a user message with a file', () => {
        const messages: Message[] = [
            {
                role: 'user',
                content: [
                    {
                        type: 'file',
                        data: 'base64-content',
                        mimeType: 'application/pdf',
                        filename: 'doc.pdf',
                    },
                ],
            },
        ];

        expect(convertMessages(messages)).toEqual([
            {
                role: 'user',
                content: [
                    {
                        type: 'file',
                        file: {
                            file_data: 'base64-content',
                            filename: 'doc.pdf',
                        },
                    },
                ],
            },
        ]);
    });

    it('should convert an assistant message with tool calls', () => {
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
                tool_calls: [
                    {
                        id: 'tc_1',
                        type: 'function',
                        function: {
                            name: 'search',
                            arguments: '{"query":"weather"}',
                        },
                    },
                ],
            },
        ]);
    });

    it('should convert a tool result message', () => {
        const messages: Message[] = [
            {
                role: 'tool',
                toolCallId: 'tc_1',
                content: 'Sunny, 72F',
            },
        ];

        expect(convertMessages(messages)).toEqual([
            {
                role: 'tool',
                tool_call_id: 'tc_1',
                content: 'Sunny, 72F',
            },
        ]);
    });
});

describe('convertTools', () => {
    it('should convert a tool set to OpenAI format', () => {
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
        const firstTool = result[0];
        expect(firstTool?.type).toBe('function');

        if (!firstTool || firstTool.type !== 'function') {
            throw new Error('Expected first tool to be a function tool');
        }

        expect(firstTool.function.name).toBe('search');
        expect(firstTool.function.description).toBe('Search the web');
        expect(firstTool.function.parameters).toMatchObject({
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
