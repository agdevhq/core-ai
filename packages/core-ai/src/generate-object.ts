import type { z } from 'zod';
import { LLMError } from './errors.ts';
import type {
    ChatModel,
    GenerateObjectOptions,
    GenerateObjectResult,
} from './types.ts';

export type GenerateObjectParams<TSchema extends z.ZodType> =
    GenerateObjectOptions<TSchema> & {
        model: ChatModel;
    };

export async function generateObject<TSchema extends z.ZodType>(
    params: GenerateObjectParams<TSchema>
): Promise<GenerateObjectResult<TSchema>> {
    if (params.messages.length === 0) {
        throw new LLMError('messages must not be empty');
    }

    const { model, ...options } = params;
    return model.generateObject(options);
}
