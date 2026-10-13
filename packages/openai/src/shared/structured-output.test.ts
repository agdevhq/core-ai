import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationError } from '@core-ai/core-ai';
import { createStructuredOutputRequestOptions } from './structured-output.ts';

function getJsonSchemaFormat(
    schema: Parameters<typeof createStructuredOutputRequestOptions>[0]['schema']
) {
    return createStructuredOutputRequestOptions({
        messages: [{ role: 'user', content: 'hi' }],
        schema,
        schemaName: 'answer',
    }).structuredOutputFormat;
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

    it('rejects optional keys strict mode cannot express', () => {
        expect(() =>
            getJsonSchemaFormat(z.object({ note: z.string().optional() }))
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
            'tool'
        );

        expect(options.tools?.structured_output?.parameters).toEqual(
            z.toJSONSchema(z.object({ city: z.string() }), { io: 'input' })
        );
    });
});
