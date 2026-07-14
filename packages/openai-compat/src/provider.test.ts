import { describe, expect, it, vi } from 'vitest';

import {
    createOpenAICompat,
    type OpenAICompatProviderOptions,
} from './provider.js';

describe('createOpenAICompat', () => {
    it('should expose only compatibility-enabled Chat Completions models', async () => {
        const create = vi.fn(async () => ({
            id: 'chatcmpl-1',
            object: 'chat.completion',
            created: Date.now(),
            model: 'qwen3-235b',
            choices: [
                {
                    index: 0,
                    finish_reason: 'stop',
                    logprobs: null,
                    message: {
                        role: 'assistant',
                        content: 'answer',
                        refusal: null,
                        reasoning_content: 'thinking',
                    },
                },
            ],
            usage: {
                prompt_tokens: 1,
                completion_tokens: 2,
                total_tokens: 3,
            },
        }));
        const client = {
            chat: {
                completions: { create },
            },
        } as unknown as NonNullable<OpenAICompatProviderOptions['client']>;
        const provider = createOpenAICompat({ client });

        expect(Object.keys(provider)).toEqual(['chatModel']);

        const model = provider.chatModel('qwen3-235b');
        const result = await model.generate({
            messages: [{ role: 'user', content: 'hello' }],
        });

        expect(model.provider).toBe('openai-compat');
        expect(result.reasoning).toBe('thinking');
        expect(result.content).toBe('answer');
    });
});
