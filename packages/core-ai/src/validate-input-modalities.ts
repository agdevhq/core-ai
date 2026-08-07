import { UnsupportedInputModalityError } from './errors.ts';
import type { ChatInputModality, Message, ModelCapabilities } from './types.ts';

export type ValidateInputModalitiesOptions = {
    messages: Message[];
    capabilities: ModelCapabilities;
    modelId: string;
    providerId: string;
};

/**
 * Rejects user content parts whose modalities are not in
 * `capabilities.modalities.input`. Part `type` values map 1:1 to input
 * modalities (`text`, `image`, `file`, and future `audio` / `video`).
 */
export function validateInputModalities({
    messages,
    capabilities,
    modelId,
    providerId,
}: ValidateInputModalitiesOptions): void {
    const requestedModalities = collectRequestedInputModalities(messages);
    if (requestedModalities.length === 0) {
        return;
    }

    const supportedModalities = capabilities.modalities.input;
    const unsupportedModalities = requestedModalities.filter(
        (modality) => !supportedModalities.includes(modality)
    );
    if (unsupportedModalities.length === 0) {
        return;
    }

    throw new UnsupportedInputModalityError({
        modelId,
        providerId,
        requestedModalities,
        supportedModalities,
        unsupportedModalities,
    });
}

function collectRequestedInputModalities(
    messages: Message[]
): ChatInputModality[] {
    const requested = new Set<ChatInputModality>();

    for (const message of messages) {
        if (message.role !== 'user') {
            continue;
        }

        if (typeof message.content === 'string') {
            requested.add('text');
            continue;
        }

        for (const part of message.content) {
            requested.add(part.type);
        }
    }

    return [...requested];
}
