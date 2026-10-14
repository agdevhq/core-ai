import { toAsyncIterable } from '@core-ai/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    StructuredOutputNoObjectGeneratedError,
    StructuredOutputParseError,
    StructuredOutputValidationError,
} from './errors.ts';
import { normalizeSchema } from './schema.ts';
import {
    extractStructuredObject,
    formatSchemaIssues,
    parseStructuredOutput,
    transformStructuredOutputStream,
    validateStructuredOutput,
} from './structured-output.ts';
import type {
    ChatUsage,
    GenerateResult,
    ObjectStreamEvent,
    StreamEvent,
} from './types.ts';

const usage: ChatUsage = {
    inputTokens: 1,
    outputTokens: 1,
    inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: 0 },
    outputTokenDetails: {},
};

const countSchema = normalizeSchema(
    z.object({ count: z.string().transform(Number) })
);

function createResult(
    overrides: Pick<GenerateResult, 'content' | 'toolCalls'>
): GenerateResult {
    return {
        parts: [],
        reasoning: null,
        finishReason: 'stop',
        usage,
        ...overrides,
    };
}

async function collect<TEvent>(
    events: AsyncIterable<TEvent>
): Promise<TEvent[]> {
    const collected: TEvent[] = [];
    for await (const event of events) {
        collected.push(event);
    }
    return collected;
}

describe('extractStructuredObject', () => {
    it('validates the arguments of the structured output tool call', async () => {
        const result = createResult({
            content: '{"count":"1"}',
            toolCalls: [{ id: '1', name: 'answer', arguments: { count: '2' } }],
        });

        await expect(
            extractStructuredObject(result, countSchema, 'test', 'answer')
        ).resolves.toEqual({ count: 2 });
    });

    it('falls back to the text content', async () => {
        const result = createResult({
            content: ' {"count":"3"} ',
            toolCalls: [],
        });

        await expect(
            extractStructuredObject(result, countSchema, 'test', 'answer')
        ).resolves.toEqual({ count: 3 });
    });

    it('throws when the response has no payload', async () => {
        const result = createResult({ content: '  ', toolCalls: [] });

        await expect(
            extractStructuredObject(result, countSchema, 'test', 'answer')
        ).rejects.toThrow(StructuredOutputNoObjectGeneratedError);
    });
});

describe('transformStructuredOutputStream', () => {
    const finish: StreamEvent = {
        type: 'finish',
        finishReason: 'stop',
        usage,
    };

    it('emits the object when the structured output tool call ends', async () => {
        const events = await collect(
            transformStructuredOutputStream(
                toAsyncIterable<StreamEvent>([
                    {
                        type: 'tool-call-delta',
                        toolCallId: '1',
                        argumentsDelta: '{"count":"4"}',
                    },
                    {
                        type: 'tool-call-end',
                        toolCall: {
                            id: '1',
                            name: 'answer',
                            arguments: { count: '4' },
                        },
                    },
                    finish,
                ]),
                countSchema,
                'test',
                'answer'
            )
        );

        expect(events).toEqual<ObjectStreamEvent<z.ZodType>[]>([
            { type: 'object-delta', text: '{"count":"4"}' },
            { type: 'object', object: { count: 4 } },
            { type: 'finish', finishReason: 'stop', usage },
        ]);
    });

    it('parses the buffered text at finish when no tool call ended', async () => {
        const events = await collect(
            transformStructuredOutputStream(
                toAsyncIterable<StreamEvent>([
                    { type: 'text-delta', text: '{"count":' },
                    { type: 'text-delta', text: '"5"}' },
                    finish,
                ]),
                countSchema,
                'test',
                'answer'
            )
        );

        expect(events.at(-2)).toEqual({ type: 'object', object: { count: 5 } });
    });

    it('parses only the structured output call arguments at finish', async () => {
        const events = await collect(
            transformStructuredOutputStream(
                toAsyncIterable<StreamEvent>([
                    {
                        type: 'tool-call-start',
                        toolCallId: '1',
                        toolName: 'other',
                    },
                    {
                        type: 'tool-call-delta',
                        toolCallId: '1',
                        argumentsDelta: '{"x":1}',
                    },
                    // Mistral and Chat Completions announce a call after its
                    // first delta
                    {
                        type: 'tool-call-delta',
                        toolCallId: '2',
                        argumentsDelta: '{"count":"6"}',
                    },
                    {
                        type: 'tool-call-start',
                        toolCallId: '2',
                        toolName: 'answer',
                    },
                    finish,
                ]),
                countSchema,
                'test',
                'answer'
            )
        );

        expect(events.at(-2)).toEqual({ type: 'object', object: { count: 6 } });
    });

    it('throws at finish when the stream had no payload', async () => {
        await expect(
            collect(
                transformStructuredOutputStream(
                    toAsyncIterable<StreamEvent>([finish]),
                    countSchema,
                    'test',
                    'answer'
                )
            )
        ).rejects.toThrow(StructuredOutputNoObjectGeneratedError);
    });
});

describe('parseStructuredOutput', () => {
    it('returns the schema output for valid JSON', async () => {
        const schema = normalizeSchema(
            z.object({ count: z.string().transform(Number) })
        );

        await expect(
            parseStructuredOutput(schema, '{"count":"3"}', 'test')
        ).resolves.toEqual({ count: 3 });
    });

    it('throws StructuredOutputParseError for invalid JSON', async () => {
        const schema = normalizeSchema(z.object({}));

        const error = await parseStructuredOutput(schema, '{', 'test').catch(
            (caught: unknown) => caught
        );
        expect(error).toBeInstanceOf(StructuredOutputParseError);
        expect(error).toMatchObject({ provider: 'test', rawOutput: '{' });
    });

    it('returns the parsed JSON unvalidated for plain JSON Schema', async () => {
        const schema = normalizeSchema({
            type: 'object',
            properties: { count: { type: 'number' } },
        });

        await expect(
            parseStructuredOutput(schema, '{"count":"not a number"}', 'test')
        ).resolves.toEqual({ count: 'not a number' });
    });
});

describe('validateStructuredOutput', () => {
    it('throws StructuredOutputValidationError with formatted issues', async () => {
        const schema = normalizeSchema(
            z.object({ user: z.object({ name: z.string() }) })
        );

        const error = await validateStructuredOutput(
            schema,
            { user: { name: 1 } },
            'test',
            '{"user":{"name":1}}'
        ).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(StructuredOutputValidationError);
        expect(error).toMatchObject({
            provider: 'test',
            rawOutput: '{"user":{"name":1}}',
            issues: [
                'user.name: Invalid input: expected string, received number',
            ],
        });
    });

    it('wraps a validator that throws in StructuredOutputValidationError', async () => {
        const schema = normalizeSchema(
            z.object({ url: z.string().transform((url) => new URL(url)) })
        );

        const error = await validateStructuredOutput(
            schema,
            { url: 'not a url' },
            'test',
            '{"url":"not a url"}'
        ).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(StructuredOutputValidationError);
        expect(error).toMatchObject({
            provider: 'test',
            rawOutput: '{"url":"not a url"}',
            issues: ['<root>: Invalid URL'],
            cause: expect.any(TypeError),
        });
    });

    it('awaits asynchronous validators', async () => {
        const schema = {
            jsonSchema: { type: 'object' },
            validate: async (value: unknown) => ({ value: { wrapped: value } }),
        };

        await expect(
            validateStructuredOutput(schema, 1, 'test')
        ).resolves.toEqual({ wrapped: 1 });
    });
});

describe('formatSchemaIssues', () => {
    it('formats path segments and root issues', () => {
        expect(
            formatSchemaIssues([
                { message: 'bad', path: ['items', 0, { key: 'id' }] },
                { message: 'missing' },
                { message: 'empty', path: [] },
            ])
        ).toEqual(['items.0.id: bad', '<root>: missing', '<root>: empty']);
    });
});
