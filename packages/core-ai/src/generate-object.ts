import type { z } from 'zod';
import { assertNonEmptyMessages } from './assertions.ts';
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
    assertNonEmptyMessages(params.messages);

    const { model, ...options } = params;
    return model.generateObject(options);
}
