import { LLMError } from './errors.ts';
import type { ChatModel, GenerateOptions, GenerateResult } from './types.ts';

export type GenerateParams = GenerateOptions & {
    model: ChatModel;
};

export async function generate(
    params: GenerateParams
): Promise<GenerateResult> {
    if (params.messages.length === 0) {
        throw new LLMError('messages must not be empty');
    }

    const { model, ...options } = params;
    return model.generate(options);
}
