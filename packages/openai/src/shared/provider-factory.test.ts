import type OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import type { ModelCapabilities } from '@core-ai/core-ai';

import { createOpenAIProvider } from './provider-factory.js';

const CAPABILITIES: ModelCapabilities = {
    reasoning: {
        supported: false,
        supportedEfforts: [],
        restrictsSamplingParams: false,
    },
};

describe('createOpenAIProvider', () => {
    it('should apply registered capabilities to both chat APIs', () => {
        const provider = createOpenAIProvider(
            { client: createMockClient() },
            {
                modelCapabilities: {
                    'custom-model': CAPABILITIES,
                },
            }
        );

        expect(provider.chatModel('custom-model').capabilities).toBe(
            CAPABILITIES
        );
        expect(provider.chat.chatModel('custom-model').capabilities).toBe(
            CAPABILITIES
        );
    });
});

function createMockClient(): OpenAI {
    return {
        chat: {
            completions: {
                create: async () => {
                    throw new Error('not implemented');
                },
            },
        },
    } as unknown as OpenAI;
}
