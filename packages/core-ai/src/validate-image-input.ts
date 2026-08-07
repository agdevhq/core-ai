import { ValidationError } from './errors.ts';
import { supportsInputModality } from './model-capabilities.ts';
import type { Message, ModelCapabilities } from './types.ts';

export type ValidateImageInputOptions = {
    messages: Message[];
    capabilities: ModelCapabilities;
    modelId: string;
    providerId: string;
};

export function validateImageInput({
    messages,
    capabilities,
    modelId,
    providerId,
}: ValidateImageInputOptions): void {
    if (supportsInputModality(capabilities, 'image')) {
        return;
    }

    for (const message of messages) {
        if (message.role !== 'user' || typeof message.content === 'string') {
            continue;
        }

        for (const part of message.content) {
            if (part.type === 'image') {
                throw new ValidationError(
                    `${providerId} model "${modelId}" does not support image input`,
                    undefined,
                    providerId
                );
            }
        }
    }
}
