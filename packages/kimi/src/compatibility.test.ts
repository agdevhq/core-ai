import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationError } from '@core-ai/core-ai';

import { prepareKimiGenerateOptions } from './compatibility.ts';
import { KIMI_MODEL_CAPABILITIES } from './model-capabilities.ts';

function prepareOptions(
    options: Parameters<typeof prepareKimiGenerateOptions>[1]
) {
    return prepareKimiGenerateOptions(
        'kimi-k2.7-code',
        options,
        KIMI_MODEL_CAPABILITIES['kimi-k2.7-code']
    );
}

describe('prepareKimiGenerateOptions', () => {
    it('should omit fixed sampling parameters', () => {
        const options = prepareOptions({
            messages: [{ role: 'user', content: 'Hi' }],
            temperature: 1,
            topP: 0.95,
            maxTokens: 32768,
        });

        expect(options.temperature).toBeUndefined();
        expect(options.topP).toBeUndefined();
        expect(options.maxTokens).toBe(32768);
    });

    it('should omit unsupported reasoning effort', () => {
        const options = prepareOptions({
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: { effort: 'high' },
        });

        expect(options.reasoning).toBeUndefined();
    });

    it('should reject unsupported temperature overrides', () => {
        expect(() =>
            prepareOptions({
                messages: [{ role: 'user', content: 'Hi' }],
                temperature: 0.2,
            })
        ).toThrowError(ValidationError);
    });

    it('should reject unsupported topP overrides', () => {
        expect(() =>
            prepareOptions({
                messages: [{ role: 'user', content: 'Hi' }],
                topP: 1,
            })
        ).toThrowError(ValidationError);
    });

    it('should reject forced tool choice on always-on thinking models', () => {
        expect(() =>
            prepareOptions({
                messages: [{ role: 'user', content: 'Hi' }],
                tools: {
                    get_weather: {
                        name: 'get_weather',
                        description: 'Get weather',
                        parameters: z.object({ city: z.string() }),
                    },
                },
                toolChoice: {
                    type: 'tool',
                    toolName: 'get_weather',
                },
            })
        ).toThrowError(ValidationError);
    });

    it('should map Kimi provider options to OpenAI request options', () => {
        const options = prepareOptions({
            messages: [{ role: 'user', content: 'Return JSON' }],
            providerOptions: {
                kimi: {
                    parallelToolCalls: false,
                    seed: 42,
                    stopSequences: ['done'],
                    user: 'user-1',
                },
            },
        });

        expect(options.providerOptions?.openai).toEqual({
            parallelToolCalls: false,
            seed: 42,
            stopSequences: ['done'],
            user: 'user-1',
        });
    });
});
