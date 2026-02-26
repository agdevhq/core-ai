import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool, type Message, type ToolSet } from '@core-ai/core-ai';
import {
    createStructuredOutputOptions,
    convertMessages,
    convertToolChoice,
    convertTools,
} from './chat-adapter.js';

describe('convertMessages', () => {
    it('should extract system messages separately', () => {
        const messages: Message[] = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
        ];

        const result = convertMessages(messages);

        expect(result.system).toBe('You are helpful.');
        expect(result.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('should concatenate multiple system messages', () => {
        const messages: Message[] = [
            { role: 'system', content: 'Rule 1.' },
            { role: 'system', content: 'Rule 2.' },
            { role: 'user', content: 'Hi' },
        ];

        const result = convertMessages(messages);

        expect(result.system).toBe('Rule 1.\nRule 2.');
    });

    it('should convert user image and pdf content', () => {
        const messages: Message[] = [
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Analyze these files' },
                    {
                        type: 'image',
                        source: {
                            type: 'url',
                            url: 'https://example.com/photo.jpg',
                        },
                    },
                    {
                        type: 'file',
                        data: 'base64-pdf-data',
                        mimeType: 'application/pdf',
                    },
                ],
            },
        ];

        const result = convertMessages(messages);

        expect(result.messages).toEqual([
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Analyze these files' },
                    {
                        type: 'image',
                        source: {
                            type: 'url',
                            url: 'https://example.com/photo.jpg',
                        },
                    },
                    {
                        type: 'document',
                        source: {
                            type: 'base64',
                            media_type: 'application/pdf',
                            data: 'base64-pdf-data',
                        },
                    },
                ],
            },
        ]);
    });

    it('should convert assistant tool calls to tool_use blocks', () => {
        const messages: Message[] = [
            { role: 'user', content: 'weather?' },
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

        const result = convertMessages(messages);

        expect(result.messages[1]).toEqual({
            role: 'assistant',
            content: [
                {
                    type: 'tool_use',
                    id: 'tc_1',
                    name: 'search',
                    input: { query: 'weather' },
                },
            ],
        });
    });

    it('should convert tool results to user messages with tool_result blocks', () => {
        const messages: Message[] = [
            { role: 'user', content: 'weather?' },
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
            {
                role: 'tool',
                toolCallId: 'tc_1',
                content: 'Sunny',
            },
        ];

        const result = convertMessages(messages);

        expect(result.messages[2]).toEqual({
            role: 'user',
            content: [
                {
                    type: 'tool_result',
                    tool_use_id: 'tc_1',
                    content: 'Sunny',
                },
            ],
        });
    });

    it('should merge consecutive tool results into one user message', () => {
        const messages: Message[] = [
            { role: 'user', content: 'do both' },
            {
                role: 'assistant',
                content: null,
                toolCalls: [
                    { id: 'tc_1', name: 'a', arguments: {} },
                    { id: 'tc_2', name: 'b', arguments: {} },
                ],
            },
            { role: 'tool', toolCallId: 'tc_1', content: 'result1' },
            { role: 'tool', toolCallId: 'tc_2', content: 'result2' },
        ];

        const result = convertMessages(messages);

        expect(result.messages[2]).toEqual({
            role: 'user',
            content: [
                {
                    type: 'tool_result',
                    tool_use_id: 'tc_1',
                    content: 'result1',
                },
                {
                    type: 'tool_result',
                    tool_use_id: 'tc_2',
                    content: 'result2',
                },
            ],
        });
        expect(result.messages).toHaveLength(3);
    });
});

describe('convertTools', () => {
    it('should convert tools to Anthropic format', () => {
        const tools: ToolSet = {
            search: defineTool({
                name: 'search',
                description: 'Search the web',
                parameters: z.object({ query: z.string() }),
            }),
        };

        const result = convertTools(tools);

        expect(result[0]?.name).toBe('search');
        expect(result[0]?.description).toBe('Search the web');
        expect(result[0]?.strict).toBe(true);
        expect(result[0]?.input_schema).toMatchObject({
            type: 'object',
            additionalProperties: false,
            properties: {
                query: { type: 'string' },
            },
        });
    });
});

describe('convertToolChoice', () => {
    it('should convert auto and none', () => {
        expect(convertToolChoice('auto')).toEqual({ type: 'auto' });
        expect(convertToolChoice('none')).toEqual({ type: 'none' });
    });

    it('should convert required to any', () => {
        expect(convertToolChoice('required')).toEqual({ type: 'any' });
    });

    it('should convert specific tool choice', () => {
        expect(
            convertToolChoice({
                type: 'tool',
                toolName: 'search',
            })
        ).toEqual({
            type: 'tool',
            name: 'search',
        });
    });
});

describe('structured output helpers', () => {
    it('should create output_config-based options for structured output', () => {
        const schema = z.object({
            city: z.string(),
            temperatureC: z.number(),
        });

        const result = createStructuredOutputOptions({
            messages: [{ role: 'user', content: 'Return weather as JSON' }],
            schema,
            schemaName: 'weather_schema',
            schemaDescription: 'Structured weather output',
            config: {
                maxTokens: 256,
            },
        });

        expect(result.toolChoice).toBeUndefined();
        expect(result.tools).toBeUndefined();
        expect(result.providerOptions).toMatchObject({
            output_config: {
                format: {
                    type: 'json_schema',
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                    },
                },
            },
        });
    });
});
