import type { z } from 'zod';
import { assertNonEmptyMessages } from './assertions.ts';
import { LLMError } from './errors.ts';
import { createStream } from './base-stream.ts';
import type {
    ChatModel,
    GenerateObjectResult,
    ObjectStreamEvent,
    StreamObjectOptions,
    ObjectStream,
} from './types.ts';

export type StreamObjectParams<TSchema extends z.ZodType> =
    StreamObjectOptions<TSchema> & {
        model: ChatModel;
    };

export async function streamObject<TSchema extends z.ZodType>(
    params: StreamObjectParams<TSchema>
): Promise<ObjectStream<TSchema>> {
    assertNonEmptyMessages(params.messages);

    const { model, ...options } = params;
    return model.streamObject(options);
}

export function createObjectStream<TSchema extends z.ZodType>(
    source: AsyncIterable<ObjectStreamEvent<TSchema>>,
    options: {
        signal?: AbortSignal;
    } = {}
): ObjectStream<TSchema> {
    const { signal } = options;
    let objectState:
        | { status: 'pending' }
        | { status: 'ready'; object: z.infer<TSchema> } = {
        status: 'pending',
    };
    let finishReason: GenerateObjectResult<TSchema>['finishReason'] = 'unknown';
    let usage: GenerateObjectResult<TSchema>['usage'] = {
        inputTokens: 0,
        outputTokens: 0,
        inputTokenDetails: {
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
        },
        outputTokenDetails: {},
    };

    return createStream({
        source,
        signal,
        reduceEvent(event) {
            if (event.type === 'object') {
                objectState = {
                    status: 'ready',
                    object: event.object,
                };
            } else if (event.type === 'finish') {
                finishReason = event.finishReason;
                usage = event.usage;
            }
        },
        finalizeResult() {
            if (objectState.status !== 'ready') {
                throw new LLMError(
                    'object stream completed without emitting a final object'
                );
            }

            return {
                object: objectState.object,
                finishReason,
                usage,
            };
        },
    });
}
