import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { createAnthropic } from './provider.js';

describe('createAnthropic', () => {
    it('should expose chatModel factory only', () => {
        const provider = createAnthropic({
            client: createMockClient(),
        });

        const chatModel = provider.chatModel('claude-haiku-4-5');

        expect(chatModel.provider).toBe('anthropic');
        expect(chatModel.modelId).toBe('claude-haiku-4-5');
    });

    it('should use default max tokens in generated requests', async () => {
        const create = vi.fn(async () => ({
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            model: 'claude-haiku-4-5',
            stop_reason: 'end_turn',
            stop_sequence: null,
            content: [{ type: 'text', text: 'ok', citations: null }],
            container: null,
            usage: {
                input_tokens: 1,
                output_tokens: 1,
            },
        }));
        const provider = createAnthropic({
            client: createMockClient(create),
            defaultMaxTokens: 2048,
        });

        await provider
            .chatModel('claude-haiku-4-5')
            .generate({ messages: [{ role: 'user', content: 'hello' }] });

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({ max_tokens: 2048 }),
            expect.objectContaining({ signal: undefined })
        );
    });
});

function createMockClient(
    create?: (options: unknown, requestOptions?: unknown) => Promise<unknown>
): Anthropic {
    return {
        messages: {
            create:
                create ??
                (async () => {
                    throw new Error('not implemented');
                }),
        },
    } as unknown as Anthropic;
}
