import { assertNonEmptyMessages } from './assertions.ts';
import { callModelWithOptions } from './model-options.ts';
import type { ChatModel, GenerateOptions, GenerateResult } from './types.ts';

export type GenerateParams = GenerateOptions & {
    model: ChatModel;
};

export async function generate(
    params: GenerateParams
): Promise<GenerateResult> {
    assertNonEmptyMessages(params.messages);

    return callModelWithOptions(params, (model, options) => model.generate(options));
}
