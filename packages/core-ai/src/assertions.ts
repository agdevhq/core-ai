import { LLMError } from './errors.ts';
import type { Message } from './types.ts';

export function assertNonEmptyMessages(messages: Message[]): void {
    if (messages.length === 0) {
        throw new LLMError('messages must not be empty');
    }
}

export function assertNonEmptyEmbedInput(input: string | string[]): void {
    if (typeof input === 'string' && input.length === 0) {
        throw new LLMError('input must not be empty');
    }

    if (Array.isArray(input) && input.length === 0) {
        throw new LLMError('input must not be empty');
    }
}
