import { ValidationError } from './errors.ts';
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
    const { supported, supportedSources } = capabilities.imageInput;

    for (const message of messages) {
        if (message.role !== 'user' || typeof message.content === 'string') {
            continue;
        }

        for (const part of message.content) {
            if (part.type !== 'image') {
                continue;
            }

            if (!supported) {
                throw new ValidationError(
                    `${providerId} model "${modelId}" does not support image input`,
                    undefined,
                    providerId
                );
            }

            if (!supportedSources.includes(part.source.type)) {
                throw new ValidationError(
                    `${providerId} model "${modelId}" does not support "${part.source.type}" image sources`,
                    undefined,
                    providerId
                );
            }
        }
    }
}
