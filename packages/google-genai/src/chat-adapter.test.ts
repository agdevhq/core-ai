import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FunctionCallingConfigMode } from '@google/genai';
import {
    convertMessages,
    convertToolChoice,
    convertTools,
} from './chat-adapter.js';
import { defineTool, type Message, type ToolSet } from '@core-ai/core-ai';

describe('convertMessages', () => {
    it('should extract system message into systemInstruction', () => {
        const messages: Message[] = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
        ];

        const result = convertMessages(messages);
        expect(result.systemInstruction).toBe('You are helpful.');
        expect(result.contents).toEqual([
            {
                role: 'user',
                parts: [{ text: 'Hello' }],
            },
        ]);
    });

    it('should concatenate multiple system messages', () => {
        const messages: Message[] = [
            { role: 'system', content: 'Rule 1' },
            { role: 'system', content: 'Rule 2' },
            { role: 'user', content: 'Hello' },
        ];

        const result = convertMessages(messages);
        expect(result.systemInstruction).toBe('Rule 1\nRule 2');
    });

    it('should convert user text, image URL, and file parts', () => {
        const messages: Message[] = [
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'What is this?' },
                    {
                        type: 'image',
                        source: {
                            type: 'url',
                            url: 'https://example.com/img.png?x=1',
                        },
                    },
                    {
                        type: 'file',
                        data: 'base64-content',
                        mimeType: 'application/pdf',
                        filename: 'doc.pdf',
                    },
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            mediaType: 'image/jpeg',
                            data: 'base64-image',
                        },
                    },
                ],
            },
        ];

        const result = convertMessages(messages);

        expect(result.contents).toEqual([
            {
                role: 'user',
                parts: [
                    { text: 'What is this?' },
                    {
                        fileData: {
                            fileUri: 'https://example.com/img.png?x=1',
                            mimeType: 'application/octet-stream',
                        },
                    },
                    {
                        inlineData: {
                            data: 'base64-content',
                            mimeType: 'application/pdf',
                        },
                    },
                    {
                        inlineData: {
                            data: 'base64-image',
                            mimeType: 'image/jpeg',
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

        expect(convertMessages(messages).contents).toEqual([
            {
                role: 'model',
                parts: [
                    {
                        functionCall: {
                            id: 'tc_1',
                            name: 'search',
                            args: { query: 'weather' },
                        },
                    },
                ],
            },
        ]);
    });

    it('should convert a tool result message', () => {
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
                    {
                        id: 'tc_2',
                        name: 'temperature',
                        arguments: { city: 'Berlin' },
                    },
                ],
            },
            {
                role: 'tool',
                toolCallId: 'tc_1',
                content: 'Sunny, 72F',
            },
            {
                role: 'tool',
                toolCallId: 'tc_2',
                content: '18C',
            },
        ];

        expect(convertMessages(messages).contents).toEqual([
            {
                role: 'model',
                parts: [
                    {
                        functionCall: {
                            id: 'tc_1',
                            name: 'search',
                            args: { query: 'weather' },
                        },
                    },
                    {
                        functionCall: {
                            id: 'tc_2',
                            name: 'temperature',
                            args: { city: 'Berlin' },
                        },
                    },
                ],
            },
            {
                role: 'user',
                parts: [
                    {
                        functionResponse: {
                            id: 'tc_1',
                            name: 'search',
                            response: { output: 'Sunny, 72F' },
                        },
                    },
                    {
                        functionResponse: {
                            id: 'tc_2',
                            name: 'temperature',
                            response: { output: '18C' },
                        },
                    },
                ],
            },
        ]);
    });

    it('should mark tool errors in function response payload', () => {
        const messages: Message[] = [
            {
                role: 'assistant',
                content: null,
                toolCalls: [{ id: 'tc_1', name: 'search', arguments: {} }],
            },
            {
                role: 'tool',
                toolCallId: 'tc_1',
                content: 'timeout',
                isError: true,
            },
        ];

        const result = convertMessages(messages);
        const part = result.contents[1]?.parts?.[0];
        expect(part?.functionResponse?.response).toEqual({ error: 'timeout' });
    });
});

describe('convertTools', () => {
    it('should convert a tool set to Google format', () => {
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

        expect(result).toHaveLength(1);
        const firstTool = result[0];
        if (!firstTool?.functionDeclarations?.[0]) {
            throw new Error('Expected first function declaration');
        }

        expect(firstTool.functionDeclarations[0].name).toBe('search');
        expect(firstTool.functionDeclarations[0].description).toBe(
            'Search the web'
        );
        expect(firstTool.functionDeclarations[0].parametersJsonSchema).toMatchObject({
            type: 'object',
            properties: {
                query: { type: 'string' },
            },
        });
    });
});

describe('convertToolChoice', () => {
    it('should map core string choices to function calling config', () => {
        expect(convertToolChoice('auto')).toEqual({
            functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
        });
        expect(convertToolChoice('none')).toEqual({
            functionCallingConfig: { mode: FunctionCallingConfigMode.NONE },
        });
        expect(convertToolChoice('required')).toEqual({
            functionCallingConfig: { mode: FunctionCallingConfigMode.ANY },
        });
    });

    it('should convert specific tool choice', () => {
        expect(
            convertToolChoice({
                type: 'tool',
                toolName: 'search',
            })
        ).toEqual({
            functionCallingConfig: {
                mode: FunctionCallingConfigMode.ANY,
                allowedFunctionNames: ['search'],
            },
        });
    });
});
