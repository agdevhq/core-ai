import { assertNonEmptyMessages } from './assertions.ts';
import { callModelWithOptions } from './model-options.ts';
import type { ChatModel, GenerateOptions, ChatStream } from './types.ts';

export type StreamParams = GenerateOptions & {
    model: ChatModel;
};

export async function stream(params: StreamParams): Promise<ChatStream> {
    assertNonEmptyMessages(params.messages);

    return callModelWithOptions(params, (model, options) => model.stream(options));
}
