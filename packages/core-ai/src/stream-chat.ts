import { LLMError } from './errors.ts';
import type {
    ChatModel,
    GenerateOptions,
    StreamResult,
} from './types.ts';

export type StreamParams = GenerateOptions & {
    model: ChatModel;
};

export async function stream(params: StreamParams): Promise<StreamResult> {
    if (params.messages.length === 0) {
        throw new LLMError('messages must not be empty');
    }

    const { model, ...options } = params;
    return model.stream(options);
}
