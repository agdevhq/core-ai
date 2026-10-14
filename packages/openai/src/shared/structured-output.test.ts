import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationError } from '@core-ai/core-ai';
import { createStructuredOutputRequestOptions } from './structured-output.ts';

function getJsonSchemaFormat(
    schema: Parameters<typeof createStructuredOutputRequestOptions>[0]['schema']
) {
    return createStructuredOutputRequestOptions(
        {
            messages: [{ role: 'user', content: 'hi' }],
            schema,
            schemaName: 'answer',
        },
        'openai'
    ).structuredOutputFormat;
}

describe('createStructuredOutputRequestOptions (json-schema mode)', () => {
    it('sends a closed schema with every key required', () => {
        expect(
            getJsonSchemaFormat(
                z.object({
                    count: z.int(),
                    label: z.string().optional().nullable(),
                })
            )
        ).toEqual({
            type: 'json_schema',
            name: 'answer',
            strict: true,
            schema: {
                type: 'object',
                properties: {
                    count: { type: 'integer' },
                    label: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                },
                required: ['count', 'label'],
                additionalProperties: false,
            },
        });
    });

    it('requires keys with a default, as the output schema did', () => {
        const format = getJsonSchemaFormat(
            z.object({
                mode: z.enum(['fast', 'safe']).default('safe'),
                nested: z.object({ retries: z.number().default(1) }),
            })
        );

        expect(format).toMatchObject({
            schema: {
                required: ['mode', 'nested'],
                properties: {
                    nested: { required: ['retries'] },
                },
            },
        });
    });

    it('accepts plain JSON Schema', () => {
        expect(
            getJsonSchemaFormat({
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city'],
            })
        ).toMatchObject({
            schema: {
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city'],
                additionalProperties: false,
            },
        });
    });

    it('keeps the bytes it sent when strict conversion used the OpenAI SDK', () => {
        // Any change to these bytes misses OpenAI's prompt cache.
        const Category = z.object({
            name: z.string(),
            get children() {
                return z.array(Category);
            },
        });
        const format = getJsonSchemaFormat(
            z
                .object({
                    count: z.int(),
                    label: z.string().nullable().optional(),
                    mode: z.enum(['fast', 'safe']).default('safe'),
                    target: z.discriminatedUnion('kind', [
                        z.object({
                            kind: z.literal('branch'),
                            name: z.string(),
                        }),
                        z.object({
                            kind: z.literal('commit'),
                            sha: z.string(),
                        }),
                    ]),
                    category: Category,
                })
                .describe('A test run')
        );

        expect(
            JSON.stringify(format?.type === 'json_schema' && format.schema)
        ).toBe(
            '{"type":"object","properties":{"count":{"type":"integer"},"label":{"anyOf":[{"type":"string"},{"type":"null"}]},"mode":{"default":"safe","type":"string","enum":["fast","safe"]},"target":{"anyOf":[{"type":"object","properties":{"kind":{"type":"string","const":"branch"},"name":{"type":"string"}},"required":["kind","name"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","const":"commit"},"sha":{"type":"string"}},"required":["kind","sha"],"additionalProperties":false}]},"category":{"$ref":"#/$defs/__schema0"}},"required":["count","label","mode","target","category"],"description":"A test run","$defs":{"__schema0":{"type":"object","properties":{"name":{"type":"string"},"children":{"type":"array","items":{"$ref":"#/$defs/__schema0"}}},"required":["name","children"],"additionalProperties":false}},"additionalProperties":false}'
        );
    });

    it('requires optional keys whose type array allows null', () => {
        expect(
            getJsonSchemaFormat({
                type: 'object',
                properties: { note: { type: ['string', 'null'] } },
            })
        ).toMatchObject({
            schema: {
                properties: { note: { type: ['string', 'null'] } },
                required: ['note'],
            },
        });
    });

    it('drops null defaults', () => {
        expect(
            getJsonSchemaFormat(
                z.object({ note: z.string().nullable().default(null) })
            )
        ).toEqual({
            type: 'json_schema',
            name: 'answer',
            strict: true,
            schema: {
                type: 'object',
                properties: {
                    note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                },
                required: ['note'],
                additionalProperties: false,
            },
        });
    });

    it('rejects every optional key strict mode cannot express, by path', () => {
        const createFormat = () =>
            getJsonSchemaFormat({
                type: 'object',
                properties: {
                    note: { type: 'string' },
                    meta: {
                        type: 'object',
                        properties: { tag: { type: 'string' } },
                    },
                },
                required: ['meta'],
            });

        expect(createFormat).toThrow(ValidationError);
        expect(createFormat).toThrow(
            expect.objectContaining({
                provider: 'openai',
                message:
                    'structured output schema "answer" cannot be sent as an OpenAI strict JSON Schema: optional keys at properties.note, properties.meta.properties.tag; strict mode requires every key, so make each one required or let it accept null (e.g. Zod\'s .nullable())',
            })
        );
    });

    it('rejects a root that is not an object schema', () => {
        expect(() =>
            getJsonSchemaFormat({ type: 'array', items: { type: 'string' } })
        ).toThrow(/must be an object schema/);
    });
});

describe('createStructuredOutputRequestOptions (json-object mode)', () => {
    it('shows the schema as is, optional keys included', () => {
        const options = createStructuredOutputRequestOptions(
            {
                messages: [{ role: 'user', content: 'hi' }],
                schema: z.object({ note: z.string().optional() }),
                schemaName: 'answer',
            },
            'openai',
            'json-object'
        );

        expect(options.structuredOutputFormat).toEqual({ type: 'json_object' });
        expect(options.messages[0]).toEqual({
            role: 'system',
            content: [
                'Return only a valid JSON object.',
                'Schema name: answer.',
                'Description: Return a JSON object that matches the requested schema.',
                'JSON Schema: {"type":"object","properties":{"note":{"type":"string"}}}',
                'Do not include markdown, prose, or any text outside the JSON object.',
            ].join('\n'),
        });
    });

    it('rejects a root that is not an object schema', () => {
        expect(() =>
            createStructuredOutputRequestOptions(
                {
                    messages: [{ role: 'user', content: 'hi' }],
                    schema: z.array(z.string()),
                },
                'openai',
                'json-object'
            )
        ).toThrow(ValidationError);
    });
});

describe('createStructuredOutputRequestOptions (tool mode)', () => {
    it('declares the schema as plain JSON Schema', () => {
        const options = createStructuredOutputRequestOptions(
            {
                messages: [{ role: 'user', content: 'hi' }],
                schema: z.object({ city: z.string() }),
            },
            'openai',
            'tool'
        );

        expect(options.tools?.structured_output?.parameters).toEqual(
            z.toJSONSchema(z.object({ city: z.string() }), { io: 'input' })
        );
    });
});
