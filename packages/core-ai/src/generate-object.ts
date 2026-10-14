import { assertNonEmptyMessages } from './assertions.ts';
import { callModelWithOptions } from './model-options.ts';
import type {
    ChatModel,
    GenerateObjectOptions,
    GenerateObjectResult,
    SchemaInput,
} from './types.ts';

export type GenerateObjectParams<TSchema extends SchemaInput> =
    GenerateObjectOptions<TSchema> & {
        model: ChatModel;
    };

export async function generateObject<TSchema extends SchemaInput>(
    params: GenerateObjectParams<TSchema>
): Promise<GenerateObjectResult<TSchema>> {
    assertNonEmptyMessages(params.messages);

    return callModelWithOptions(params, (model, options) =>
        model.generateObject(options)
    );
}
